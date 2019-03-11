const fs = require('fs');
const dt = require('date-and-time');
const parse = require('parse-duration')
const Discord = require('discord.js');
const schedule = require('node-schedule');

const config = require('./config.js');
const client = new Discord.Client();


dt.setLocales('en', {
    A: ['AM', 'PM']
});

Array.prototype.random = function () {
    return this[Math.floor((Math.random()*this.length))];
};

let db = require('./db/database.json');
if (!db) throw new Error('An error occured while reading the database. Aborting...');


function handleMessage(message) {

    if (message.author.bot) return;
    if (message.content.indexOf(config.prefix) !== 0) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();

    return handleCommand(message, command, args);
}

function handleCommand(message, command, args) {
    switch (command) {
        case 'poll': 
            handlePoll(message, args);
            break;
        case 'stop':
            handleStop(message);
            break;
        case 'wipe':
            handleWipe(message);
            break;
        case 'yes':
            handleYes(message); 
            break;
        case 'no':
            handleNo(message); 
            break;
        case 'maybe':
            handleMaybe(message); 
            break;
        case 'gear':
            handleGear(message, args);
            break;
        case 'class':
            handleClass(message, args);
            break;
        case 'attendance':
            handleAttendance(message); 
            break;
        case 'attending':
            handleAttending(message);
            break;
        default: 
            break;
    }
    return;
}

function handlePoll(message, args) {

    let [event, place, remind, ...time] = args;
    time = dt.parse(time.join(' '), 'MM/DD HH:mm');

    if (!message.member.roles.has(config.roles.master) && !message.member.roles.has(config.roles.officer)) 
        return;

    if (!event || !place || !time || !remind) 
        return message.channel.send('**Usage:** poll [event] [place] [remind] [time]\n**Accepted time formats:** 03/15 16:00, 12/01 01:30');

    if (remind.toLowerCase() !== 'yes' && remind.toLowerCase() !== 'no')
        return message.channel.send('**Usage:** poll [event] [place] [remind=yes/no] [time]');

    time.setYear(new Date().getFullYear())

    if (time < new Date) 
        return message.channel.send('**Usage:** poll [event] [place] [remind] [time]\n**Accepted time formats:** 03/15 16:00, 12/01 01:30');

    if (db.current.status === 'running') 
        return message.channel.send(`A poll is already in progress..`);

    
    db.current.status = 'running';
    db.current.remind = (remind === 'yes') ? true : false;
    db.current.timeBeforeReminding = '1d';
    
    db.current.event = event;
    db.current.time = time;
    db.current.place = place;

    saveDb();

    message.guild.channels.get(config.channels.guildAttendance).send(`Upcoming ${event} on ${dt.format(time, 'MMM D hh:mm A')} at ${place}. `);
    message.channel.send(config.successMessages.random());
}

function handleStop(message) {

    if (!message.member.roles.has(config.roles.master) && !message.member.roles.has(config.roles.officer)) 
        return;

    if (db.current.status !== 'running') 
        return message.channel.send(`Poll is currently not running to be stopped.`)
    
    db.current.status = 'stopped';

    saveDb();
    message.channel.send(config.successMessages.random());
}

function handleWipe(message) {

    if (!message.member.roles.has(config.roles.master) && !message.member.roles.has(config.roles.officer)) 
        return;

    if (db.current.status !== 'stopped') 
        return message.channel.send(`Poll has to be stopped before being wiped.`);
    
    
    db.current.status = null;
    db.current.remind = null;
    db.current.timeBeforeReminding = null;

    
    db.current.event = null;
    db.current.time = null;
    db.current.place = null;

    db.attending = [];
    db.notAttending = [];
    db.maybe = [];

    saveDb();
    message.channel.send(config.successMessages.random());
}

function handleYes(message) {
    if (message.channel.id != config.channels.guildAttendance)
        return;
    
    if (!message.member.roles.has(config.roles.guildies)) 
        return message.channel.send(`You are not a member of the 'Guildies' role.`);

    if (db.current.status !== 'running') 
        return message.channel.send(`There is no current active poll`);
    
    if (db.notAttending.includes(message.member.id) || db.attending.includes(message.member.id) || db.maybe.includes(message.member.id))
        return message.channel.send(`You are already registered for this poll.`);

    db.attending.push(message.member.id);
    message.react('✅');
    
    saveDb();
}

function handleNo(message) {
    if (message.channel.id != config.channels.guildAttendance)
        return;
    
    if (!message.member.roles.has(config.roles.guildies)) 
        return message.channel.send(`You are not a member of the 'Guildies' role.`);

    if (db.current.status !== 'running') 
        return message.channel.send(`There is no current active poll`);

    if (db.notAttending.includes(message.member.id) || db.attending.includes(message.member.id) || db.maybe.includes(message.member.id))
        return message.channel.send(`You are already registered for this poll.`);

    db.notAttending.push(message.member.id);
    message.react('✅');
    
    saveDb();
}

function handleMaybe(message) {
    if (message.channel.id != config.channels.guildAttendance)
        return;

    if (!message.member.roles.has(config.roles.guildies)) 
        return message.channel.send(`You are not a member of the 'Guildies' role.`);

    if (db.current.status !== 'running') 
        return message.channel.send(`There is no current active polls`);
    
    if (db.notAttending.includes(message.member.id) || db.attending.includes(message.member.id) || db.maybe.includes(message.member.id))
        return message.channel.send(`You are already registered for this poll.`);

    db.maybe.push(message.member.id);
    message.react('✅');
    
    saveDb();
}

function handleGear(message, args) {
    if (message.channel.id != config.channels.classAndGear)
        return;

    let [gear] = args;

    if (!message.member.roles.has(config.roles.guildies)) 
        return message.channel.send(`You are not a member of the 'Guildies' role.`);
    
    if (!gear || !(gear.split('/').length == 3 && gear.length <= 12))
        return message.channel.send(`Invalid gear. Accepted format is: XXX/YYY/ZZZ`);

    if (!db.data[message.member.id]) {
        db.data[message.member.id] = {class: '', gear: ''};
    }

    db.data[message.member.id].gear = gear;
    message.react('✅');

    saveDb();
}

function handleClass(message, args) {
    if (message.channel.id != config.channels.classAndGear)
        return;

    let [_class] = args;

    if (!message.member.roles.has(config.roles.guildies)) 
        return message.channel.send(`You are not a member of the 'Guildies' role.`);
    
    if (!_class || !config.classes.includes(_class))
        return message.channel.send(`Invalid class. Accepted classes: \`\`${config.classes.join('\`\`, \`\`')}\`\``);

    if (!db.data[message.member.id]) {
        db.data[message.member.id] = {class: '', gear: ''};
    }

    db.data[message.member.id].class = _class;
    message.react('✅');

    saveDb();
}

function handleAttendance(message) {
    if (!message.member.roles.has(config.roles.master) && !message.member.roles.has(config.roles.officer)) 
        return;

    if (db.current.status !== 'running' && db.current.status !== 'stopped') 
        return message.channel.send(`There is no current active polls`);
    
    const embed = new Discord.RichEmbed()
        .setTitle('Guild Current Attendance Status')
        .setColor(0x00ff00)
        .setDescription(`**${db.current.event}** on **${dt.format(new Date(db.current.time), 'MMM D hh:mm A')}** at **${db.current.place}**`)

        .addField("Attending", `${db.attending.length}`, true)
        .addField("Not Attending", `${db.notAttending.length}`, true)

        .addField("Maybe", `${db.maybe.length}`, true)
        .addField("Missing", `${message.guild.members.size - (db.maybe.length + db.notAttending.length + db.attending.length)}`, true);
    
    message.channel.send(embed);
}

function handleAttending(message) {

    if (!message.member.roles.has(config.roles.master) && !message.member.roles.has(config.roles.officer)) 
        return;

    if (db.current.status !== 'running' && db.current.status !== 'stopped') 
        return message.channel.send(`There is no current active polls`);

    let count = 0;
    message.channel.send(`**Attendees: **`)

    for (let i = 0; i < db.attending.length; i += 10) {
        
        let users = [];
        let nextIter = 10;

        if (i + (db.attending.length % 10) >= db.attending.length)
            nextIter = db.attending.length % 10;

        for (let u = 0; u < nextIter; u++) {
            user = db.attending[u + i];
            users.push(`${message.guild.members.get(user).toString()}: ${db.data[user].class} : ${db.data[user].gear}`)
        }

        if (users.length != 0)  {
            message.channel.send(users.join('\n'));
            count++;
        }

    }

    if (!count)
    message.channel.send(`No attendees found.`);
}

function saveDb() {
    fs.writeFileSync('./db/database.json', JSON.stringify(db, null, 4))
}

schedule.scheduleJob('*/1 * * * *', () => {
    if (db.current.status !== 'running' && db.current.status !== 'stopped')
        return;

    if (db.current.remind !== true)
        return;

    if (new Date().getTime() > (new Date(db.current.time).getTime() - parse(config.remind))) {
        guild.members.forEach(member => {
            if (!(db.notAttending.includes(member.id) || db.attending.includes(member.id) || db.maybe.includes(member.id))) 
                message.guild.members.get(member.id).send(`${config.remindMessage}`).catch()
        });
        
    }
})

client.on('message', handleMessage);
client.on('ready', () => console.log(`Logged in as ${client.user.tag}!`));
client.on('error', console.error);

console.log('Initiating the login process...');
client.login(config.token).catch(console.error);
