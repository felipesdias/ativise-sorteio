import fs from 'fs/promises';
import path from 'path';
import * as whatsapp from 'whatsapp-chat-parser';

async function main() {
    const months = (process.argv[2] || '').split(',').filter(x => x);

    if (months.length === 0) {
        console.log('Informe os meses de pesquisa. Ex: 2021-01,2021-02,2021-03');
        process.exit(1);
    }
    const mapNames = await getMapNames();
    const files = (await fs.readdir('./data')).filter(file => file.endsWith('.txt') && file.includes('chat'));
    let txt = '';
    for (const file of files) {
        const data = await fs.readFile(`./data/${file}`, 'utf-8');
        txt += data + '\n';
    }

    const messages = whatsapp.parseString(txt, {
        daysFirst: true,
        parseAttachments: true
    });

    const ignoreFiles = ['webp', 'opus'];

    const uniqueMessages = new Set();

    const clearMessages = messages
        .filter(message => message.attachment)
        .filter(message => !ignoreFiles.includes(message.attachment.fileName.split('.').at(-1)))
        .filter(message => {
            const m = message.date.toISOString().split('T')[0];
            return months.find(x => m.startsWith(x))
        })
        .map(message => {
            const localDate = new Date(message.date.getTime() - 3 * 60 * 60 * 1000);
            return { ...message, date: localDate };
        })
        .filter(message => {
            if (message.author === 'Meta AI') {
                return false;
            }
            const key = `${message.author}-${message.date}-${message.message}-${message.attachment?.fileName}`;
            if (uniqueMessages.has(key)) {
                return false;
            }
            uniqueMessages.add(key);
            return true;
        })
        .map(message => {
            const contact = clearContact(message.author);
            if (!mapNames[contact]) {
                console.log(`Contact not found: ${message.author}`);
            }
            const author = mapNames[contact] || message.author;
            return { ...message, author };
        });

    const messagesByAuthorAndDay = clearMessages.reduce((acc, message) => {
        if (!acc[message.author]) {
            acc[message.author] = {};
        }
        const day = message.date.toISOString().split('T')[0];
        if (!acc[message.author][day]) {
            acc[message.author][day] = [];
        }
        acc[message.author][day].push(message);
        return acc;
    }, {});

    const countMessagesDayByAuthor = Object.entries(messagesByAuthorAndDay)
        .map(([author, messagesByDay]) => {
            return {
                author,
                count: Object.keys(messagesByDay).length
            };
        })
        .sort((a, b) => {
            if (b.count === a.count) {
                return a.author.localeCompare(b.author);
            }

            return b.count - a.count;
        })
        .map(({ author, count }, idx) => `[${idx + 1}] ${author}: ${count}`);

    const ignoreNames = new Set((await fs.readFile('./mapIgnoreNamesTicket.txt', 'utf-8'))
        .split('\n')
        .map(x => x.trim())
        .filter(x => x));

    const possibilitiesAuthorWithDay = Object.entries(messagesByAuthorAndDay)
        .filter(([author]) => !ignoreNames.has(author.trim()))
        .map(([author, messagesByDay]) => Object.keys(messagesByDay).map(day => `${author} - ${day}`))
        .flat()
        .sort((a, b) => {
            const [authorA, dayA] = a.split(' - ');
            const [authorB, dayB] = b.split(' - ');
            if (dayA === dayB) {
                return authorA.localeCompare(authorB);
            }
            return dayA.localeCompare(dayB);
        });

    const totalTickets = Object.entries(messagesByAuthorAndDay)
        .map(([author, messagesByDay]) => Object.keys(messagesByDay).length)
        .reduce((acc, count) => acc + count, 0);

    await fs.writeFile('./possibilities.txt', possibilitiesAuthorWithDay.join('\n'));
    console.log(countMessagesDayByAuthor);
    saveAttachmentsByAuthorAndDay(messagesByAuthorAndDay);

    const countExtionsFiles = clearMessages.map(x => x.attachment.fileName.split('.').at(-1)).reduce((acc, ext) => {
        if (!acc[ext]) {
            acc[ext] = 0;
        }
        acc[ext]++;
        return acc;
    }, {});

    console.log(new Set(clearMessages.map(x => x.attachment.fileName.split('.').at(-1))))
    console.log('Total tickets:', totalTickets);
    console.log(countExtionsFiles);
}

async function saveAttachmentsByAuthorAndDay(messagesByAuthorAndDay) {
    try {
        await fs.rm('./attachments', { recursive: true });
    } catch (e) {
    }
    for (const [author, messagesByDay] of Object.entries(messagesByAuthorAndDay)) {
        for (const [day, messages] of Object.entries(messagesByDay)) {
            const dir = `./attachments/${author}/${day}`;
            await fs.mkdir(dir, { recursive: true });
            for (const message of messages) {
                const pathAttachment = path.resolve('data', 'midia', message.attachment.fileName);
                const pathDestination = path.resolve(dir, message.attachment.fileName);
                await fs.copyFile(pathAttachment, pathDestination);
            }
        }
    }
}

async function getMapNames() {
    const mapNamesContent = (await fs.readFile('./mapNames.txt', 'utf-8'))
        .split('\n')
        .map(x => x.trim())
        .filter(x => x)
        .map(x => {
            const [name, contact] = x.split('\t');
            return { name, contact: clearContact(contact) };
        })
        .reduce((acc, { name, contact }) => {
            if (acc[contact]) {
                throw new Error(`Duplicated contact ${name} - ${contact}`);
            }

            acc[contact] = name;
            return acc;
        }, {});

    return mapNamesContent;
}

function clearContact(contact) {
    const contactHasNumber = contact.match(/\d/g);
    if (contactHasNumber) {
        return contact.replace(/\D/g, '').slice(-8);
    }
    return contact;
}


main();