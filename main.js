"use strict";

/*
 * Created with @iobroker/create-adapter v2.2.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const axios = require("axios");
// Load your modules here, e.g.:
// const fs = require("fs");

class Glances extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "glances",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Reset the connection indicator during startup
		this.setState("info.connection", false, true);
		this.connected = true;

		var online = await this.checkServerStatus();

		this.setState("info.connection", online, true);

		if (online != true) {
			this.connected = false;
			this.log.error("co connection to 'http://" + this.config.hostname + ":" + this.config.port + "' could be made");
			return;
		}

		this.connected = true;


		this.fetchDataInterval = setInterval(() => {
			this.fetchData();
		}, this.config.interval);
	}


	async checkServerStatus() {
		try {
			const response = await axios.default.get("http://" + this.config.hostname + ":" + this.config.port + "/api/3/ip");
			if (response.status == 200) {
				return true;
			}
		} catch (error) {
			console.log(error.response.body);
		}

		return false;
	}

	async fetchData() {

		try {
			const response = await axios.default.get("http://" + this.config.hostname + ":" + this.config.port + "/api/3/system");
			if (response.status == 200) {
				await this.setStateAsync("info.name", response.data.hostname, true);
				await this.setStateAsync("info.os", response.data.os_name, true);
				await this.setStateAsync("info.osversion", response.data.os_version, true);
				await this.setStateAsync("info.distro", response.data.linux_distro, true);
				await this.setStateAsync("info.osfullname", response.data.hr_name, true);
			}
		} catch (error) {
			console.log("Failed to fetch CPU data: " + error.response.body);
		}

		if (this.config.cpu == true) {
			try {
				const response = await axios.default.get("http://" + this.config.hostname + ":" + this.config.port + "/api/3/cpu");
				if (response.status == 200) {
					await this.setStateAsync("cpu.cores", response.data.cpucore, true);
					await this.setStateAsync("cpu.total", response.data.total, true);
					await this.setStateAsync("cpu.idle", response.data.idle, true);
					await this.setStateAsync("cpu.user", response.data.user, true);
					await this.setStateAsync("cpu.system", response.data.system, true);
				}
			} catch (error) {
				console.log("Failed to fetch CPU data: " + error.response.body);
			}
		}

		if (this.config.mem == true) {
			try {
				const response = await axios.default.get("http://" + this.config.hostname + ":" + this.config.port + "/api/3/mem");
				if (response.status == 200) {
					//mem total
					await this.setStateAsync("mem.total", response.data.total, true);
					var total_h = this.calcSize(response.data.total);
					await this.setStateAsync("mem.total_h", total_h.val, true);
					await this.extendObjectAsync("mem.total_h", {
						type: "state",
						common: {
							unit: total_h.unit
						},
						native: {}
					});


					//mem available
					await this.setStateAsync("mem.available", response.data.available, true);
					var available_h = this.calcSize(response.data.available);
					await this.setStateAsync("mem.available_h", available_h.val, true);
					await this.extendObjectAsync("mem.available_h", {
						type: "state",
						common: {
							unit: available_h.unit
						},
						native: {}
					});

					//mem used						
					await this.setStateAsync("mem.used", response.data.total - response.data.available, true);
					var used_h = this.calcSize(response.data.used);
					await this.setStateAsync("mem.used_h", used_h.val, true);
					await this.extendObjectAsync("mem.used_h", {
						type: "state",
						common: {
							unit: used_h.unit
						},
						native: {}
					});

					//mem percent
					await this.setStateAsync("mem.percent", response.data.percent, true);
				}
			} catch (error) {
				console.log("Failed to fetch memory data: " + error.response.body);
			}
		}

		if (this.config.disk == true) {
			try {
				const response = await axios.default.get("http://" + this.config.hostname + ":" + this.config.port + "/api/3/fs");
				if (response.status == 200) {
					for (var i = 0; i < response.data.length; i++) {
						var disk = response.data[i];


						//disk name
						await this.setObjectNotExistsAsync("disk." + disk.device_name, {
							type: "device",
							common: {
								name: disk.device_name
							},
							native: {},
						});


						//disk mountpoint
						await this.setObjectNotExistsAsync("disk." + disk.device_name + ".mountpoint", {
							type: "state",
							common: {
								name: "Mount Point",
								"role": "text",
								"type": "string",
								"read": true,
								"write": false
							},
							native: {},
						});
						await this.setStateAsync("disk." + disk.device_name + ".mountpoint", disk.mnt_point, true);

						//disk size
						await this.setObjectNotExistsAsync("disk." + disk.device_name + ".size", {
							type: "state",
							common: {
								name: "Total size",
								"role": "text",
								"type": "number",
								"unit": "B",
								"read": true,
								"write": false
							},
							native: {},
						});
						await this.setStateAsync("disk." + disk.device_name + ".size", disk.size, true);

						//disk size human readable
						var disk_size_h = this.calcSize(disk.size);
						await this.setObjectNotExistsAsync("disk." + disk.device_name + ".size", {
							type: "state",
							common: {
								name: "Total size human readable",
								"role": "text",
								"type": "number",
								"unit": disk_size_h.unit,
								"read": true,
								"write": false
							},
							native: {},
						});
						await this.setStateAsync("disk." + disk.device_name + ".size_h", disk_size_h.val, true);

						//disk used size
						await this.setObjectNotExistsAsync("disk." + disk.device_name + ".used", {
							type: "state",
							common: {
								name: "Used size",
								"role": "text",
								"type": "number",
								"unit": "B",
								"read": true,
								"write": false
							},
							native: {},
						});
						await this.setStateAsync("disk." + disk.device_name + ".used", disk.used, true);

						//disk used size human readable
						var disk_used_h = this.calcSize(disk.used);
						await this.setObjectNotExistsAsync("disk." + disk.device_name + ".used_h", {
							type: "state",
							common: {
								name: "Used size human readable",
								"role": "text",
								"type": "number",
								"unit": disk_used_h.unit,
								"read": true,
								"write": false
							},
							native: {},
						});
						await this.setStateAsync("disk." + disk.device_name + ".used_h", disk_used_h.val, true);

						//disk size free
						await this.setObjectNotExistsAsync("disk." + disk.device_name + ".free", {
							type: "state",
							common: {
								name: "Free size",
								"role": "text",
								"type": "number",
								"unit": "B",
								"read": true,
								"write": false
							},
							native: {},
						});
						await this.setStateAsync("disk." + disk.device_name + ".free", disk.free, true);


						//disk free size human readable
						var disk_free_h = this.calcSize(disk.free);
						await this.setObjectNotExistsAsync("disk." + disk.device_name + ".free_h", {
							type: "state",
							common: {
								name: "Free size human readable",
								"role": "text",
								"type": "number",
								"unit": disk_free_h.unit,
								"read": true,
								"write": false
							},
							native: {},
						});
						await this.setStateAsync("disk." + disk.device_name + ".free_h", disk_free_h.val, true);

						//disk percent
						await this.setObjectNotExistsAsync("disk." + disk.device_name + ".percent", {
							type: "state",
							common: {
								name: "Usage in percent",
								"role": "text",
								"type": "number",
								"unit": "%",
								"read": true,
								"write": false
							},
							native: {},
						});
						await this.setStateAsync("disk." + disk.device_name + ".percent", disk.percent, true);
					}
				}
			} catch (error) {
				console.log("Failed to fetch disk data: " + error.response.body);
			}
		}
	}

	calcSize(size) {
		const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
		let l = 0, n = parseInt(size, 10) || 0;
		while (n >= 1024 && ++l) {
			n = n / 1024;
		}

		var val = n.toFixed(n < 10 && l > 0 ? 1 : 0);
		var unit = units[l];
		return { val: val, unit: unit };
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			clearInterval(this.fetchDataInterval);
			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Glances(options);
} else {
	// otherwise start the instance directly
	new Glances();
}
