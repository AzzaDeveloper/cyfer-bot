// ------------------------ Loading ------------------------ //
// Modules
const Eris = require("eris")
// Music
const ytdl = require('ytdl-core');
const search = require('youtube-search-api');
const ffmpeg = require('fluent-ffmpeg');
//
const traverse = require('traverse');
const fs = require("fs")
const colors = require('colors');
// Files
var userdataFile = require("./userdata.json")
const auth = require("./auth/token.json")
const config = require("./config.json")
// Command contents
const copypasta = require ("./assets/copypasta.json");
// Bot object
const bot = new Eris(auth.token)
var users = userdataFile;
// Functions
// Function to play song
function play(url, addNewSongToQueue, voiceConnection, msg) {
	ytdl.getBasicInfo(url)
	.then(res => {
		// Add the song to the queue
		var queueInfo = {	
			user: msg.author.username,
			url: url,
			title: res.videoDetails.title,
			duration: res.videoDetails.lengthSeconds
		}
		console.log(url)
		if (addNewSongToQueue) {
			connections[msg.member.guild.id].queue.push(queueInfo);
		}
		bot.createMessage(msg.channel.id, `playing **${res.videoDetails.title}**`);
		let stream = ytdl(url, {
			//quality: 'highestaudio',
			filter: "audioonly"
		})
		if (!connections[msg.member.guild.id].active) {
			voiceConnection.play(stream);
			connections[msg.member.guild.id].active = true;
		}
	})
	.catch(error => {
		console.log(error)
	})
}
// Bot ready
bot.on("ready", () => {
	console.log("Cyfer is up and running.".brightGreen)
	// ------------------------ User Data Handling ------------------------ //
	// Set up default user structure
	var defaultUser = {
		version: 0,
		// Levelling
		level: 1,
		exp: 0,
		expMax: 1000,
		lastMessageTime: 0,
	}
	// Loop through guilds and their members
	bot.guilds.map((guild) => {
		console.log(`Loading server: ${guild.name.green}`)
		// Check if member exist in saves
		guild.fetchMembers().then((members) => {
			for (var member of members) {
				if (!member.bot) {
					console.log(`Loading member ${member.username.cyan} (${guild.name.green})`)
					var user = users[member.id];
					// Initialize data if user id is not founded in userdata
					if ((user == undefined) || (user.version < defaultUser.version)) {
						user = defaultUser;
					} else {
						// If found then verify structure
						for (var key in defaultUser) {
							// Check if key in defaultUser structure exist user structure
							if (user[key] == undefined) {
								// Update with new structure if not
								user[key] = defaultUser[key]
							}
						}
					}
					users[member.id] = user;
				}
			}
			console.log("Loading finished!")
		})
	})
})
// ------------------------ Main Bot ------------------------ //
// Music queues, separated by server
var connections = {};
// Message event
bot.on("messageCreate", (msg) => {
	// Debug
	console.log(`[${msg.channel.guild.name.yellow}] (${msg.channel.name.green}) ${msg.author.username.cyan}: ${msg.content.brightWhite}`);
	if (msg.author.bot) return
	// Check for prefix
	var id = msg.author.id
	if (msg.content.toLowerCase().startsWith(config.prefix)) {
		// Setting up args and commands
		var args = msg.content.substr(1).split(" ");
		var cmd = args[0]
		args.shift();
		// Commands
		switch(cmd) {
			case "help":
				bot.createMessage(msg.channel.id, "Cyfer is a bot that does whatever you think it does. Made by Azza.\nYou can view a list of commands here: https://github.com/AzzaDeveloper/cyfer-bot/wiki");
				break;
			case "profile":
			case "p":
				// Create vanity progress bar
				var progress = Math.floor(users[id].exp / users[id].expMax * 10)
				var progressDisplay = ""
				for (var i = 0; i < 10; i++) {
					i <= progress ? progressDisplay += "██" : progressDisplay += "      ";
				}
				bot.createMessage(msg.channel.id, {
					embed: {
						author: {
							name: msg.author.username + "'s profile",
							icon_url: msg.author.avatarURL
						},
						title: `Level ${users[id].level}`,
						fields: [
							{
								name: `[${progressDisplay}]`,
								value: users[id].exp + "/" + users[id].expMax
							}
						],
						color: 0,
					}
				})
				break;
			case "play":
				var voiceId = msg.member.voiceState.channelID;
				// If user not in a voice channel then exit
				if (voiceId == undefined) {
					bot.createMessage("dude join a voice channel first", msg.channel.id);
				} else {
					// Joins the voice channel
					bot.joinVoiceChannel(voiceId)
					// Stream the music once connection is established
					.then(voiceConnection => {
						// Check for connection in list
						if (connections[msg.member.guild.id] == undefined) {
							connections[msg.member.guild.id] = {
								connection: voiceConnection,
								queue: [],
								active: false,
								playing: 0,
								loopMode: "none",
								looping: false
							}
							voiceConnection.on("end", () => {
								console.log("ended, starting new")
								// Play the next song if available
								if (connections[msg.member.guild.id].playing == -1) {
									bot.createMessage(msg.channel.id, "queue's empty");
									return
								}
								if (connections[msg.member.guild.id].playing + 1 < connections[msg.member.guild.id].queue.length) {
									connections[msg.member.guild.id].active = false;
									var url = connections[msg.member.guild.id].queue[connections[msg.member.guild.id].playing + 1].url;
									connections[msg.member.guild.id].playing++;
									play(url, false, connections[msg.member.guild.id].connection, msg)
								} else {
									bot.createMessage(msg.channel.id, "end of queue");
									connections[msg.member.guild.id].active = false;
								}				
							})
						}
						var url;
						// Get the song, by position in queue or by the URL or get first youtube search result
						if (Number(args[0]) != NaN) {
							// If cant find pos, return bullshit
							if (connections[msg.member.guild.id].queue[args[0] - 1] == undefined) {
								bot.createMessage(msg.channel.id, "theres no song at that position in the queue are you blind");
								return
							} else {
								url = connections[msg.member.guild.id].queue[args[0] - 1].url;
								connections[msg.member.guild.id].queue[args[0] - 1].playing = args[0] - 1;
								addNewSongToQueue = true;
								// Play song
								play(url, true, voiceConnection, msg)
							}
						// Playing a link
						} else if (args[0].substr(0, 4) == "https") {
							url = args[0]
							play(url, true, voiceConnection, msg)
						// Playing a search result
						} else {
							search.GetListByKeyword(args.join(" "))
							.then(res => {
								console.log(`https://www.youtube.com/watch?v=${res.items[0].id}`)
								play(`https://www.youtube.com/watch?v=${res.items[0].id}`, true, voiceConnection, msg)
							})
						}						
					})
					// Catch errors
					.catch(message => {
						console.log(message);
					})
				}
				break;
			case "q":
				var queue;
				if (connections[msg.member.guild.id] == undefined) {
					bot.createMessage(msg.channel.id, "you need to start playing a song to start the queue");
				} else {
					queue = connections[msg.member.guild.id].queue
					var text = "";
					var i = 1;
					queue.forEach(element => {
						text = `${text}${i}. **${element.title}** - ${element.user}\n`
						i++;
					});
					bot.createMessage(msg.channel.id, text);
				}
				break;
			case "pause":
				var connection = connections[msg.member.guild.id].connection;
				connection.pause();
				break;
			case "skip":
				// Play the next song
				connections[msg.member.guild.id].connection.stopPlaying()
				break;
			case "stop":
				var connection = connections[msg.member.guild.id].connection;
				connections[msg.member.guild.id].playing = -1;
				connection.stopPlaying()
				connections[msg.member.guild.id] = undefined;
				break;
			case "resume":
				var connection = connections[msg.member.guild.id].connection;
				connection.resume();
				break;
			case "copypasta":
				var content = copypasta[args[0]];
				if (content != undefined) {
					bot.createMessage(msg.channel.id, copypasta[args[0]]);
				} else {
					bot.createMessage(msg.channel.id, "No copypasta found.");
				}
				break;
		}
	}
	// Levelling
	// Check if its been 2 seconds since last message
	if (msg.timestamp - users[id].lastMessageTime >= 2) {
		// Give exp
		users[id].exp += 10
		users[id].lastMessageTime = msg.timestamp
		// Level up and update max exp
		if (users[id].exp >= users[id].expMax) {
			users[id].level += 1;
			users[id].exp = 0;
			users[id].expMax = Math.floor(Math.pow(users[id].expMax, 1.1));
			// Create embed
			bot.createMessage(msg.channel.id, {
				embed: {
					author: {
						name: `${msg.author.username} leveled up!`,
						icon_url: msg.author.avatarURL
					},
					title: `${msg.author.username} is now level ${users[id].level}. `,
					description: `${users[id].exp} / ${users[id].expMax}`,
					color: 0,
				}
			})
		}
	}
})
// Connect the bot
bot.connect();
// -------------------------- Console ---------------------------- //
const readline = require("readline");
const { on } = require("events");
const { runInThisContext } = require("vm");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
// Sending messages
var servers = {
	gensokyo: "749259194263273603"
}
var channels = {
	hall: "749259195039350866",
	poke: "854617364947402794",
	rpg: "854545534027431946"
}
var activeServer = servers.gensokyo;
var activeChannel = "";
// Handling enters
rl.on("line", function(input) {
	var splitted = input.split(" ");
	var command = splitted[0];
	splitted.shift();
	var content = splitted.join(" ");
	if (command == "server") {
		activeServer = servers[content];
	}
	if (command == "channel") {
		activeChannel = channels[content];
	}
	if (command == "say") {
		// Find channel in that server
		bot.createMessage(activeChannel, content);
	}
	// Saving
	if (command == "save") {
		var data = fs.readFileSync("./userdata.json")
    	fs.writeFileSync("./userdata.json", data)
		console.log("User data have been saved. " + "Sure hope it isn't corrupted, huh?".red)
	}
	if (command == "exit") {
		var data = fs.readFileSync("./userdata.json")
		fs.writeFileSync("./userdata.json", data)
		console.log("User data have been saved. " + "Sure hope it isn't corrupted, huh?".red)
		process.exit()
	}

});
rl.on("close", function() {
	var data = fs.readFileSync("./userdata.json")
    fs.writeFileSync("./userdata.json", data)
	console.log("User data have been saved. " + "Sure hope it isn't corrupted, huh?".red)
	process.exit()
});