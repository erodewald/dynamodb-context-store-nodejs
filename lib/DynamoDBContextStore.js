'use strict';
const AWS = require('aws-sdk');
const primaryKey = Symbol("private");
const createTableIfNecessary = Symbol("private");

module.exports = class DynamoDBContextStore {

	/**
	 * @typedef {Object} TableOptions
	 * @prop {String=} name The name of the table
	 * @prop {String=} hashKey The name of the table
	 * @prop {String=} prefix String pre-pended to the app ID and used for the hashKey
	 * @prop {String|Object=} sortKey Optional sort key definition
	 * @prop {Number=} readCapacityUnits Number of consistent reads per second. Used only when table is created
	 * @prop {Number=} writeCapacityUnits Number of writes per second. Used only when table is created
	 */
	/**
	 * @typedef {Object} DynamoDBContextStoreOptions
	 * @prop {TableOptions=} table The table options
	 */
	/**
	 * Create a context store instance instance
	 * @param {DynamoDBContextStoreOptions} [options] Optionally, pass in a configuration object
	 */
	constructor(options = {}) {
		this.table = {
			name: "smartapp",
			hashKey: 'id',
			sortKey: null,
			prefix: 'ctx:'
		};

		if (options.table) {
			const table = options.table;
			this.table.name = table.name || this.table.name;
			this.table.hashKey = table.hashKey || this.table.hashKey;
			this.table.prefix = table.prefix || this.table.prefix;
			if (typeof options.table.sortKey === 'string') {
				this.table.sortKey = {
					AttributeName: options.table.sortKey,
					AttributeType: 'S',
					AttributeValue: 'context',
					KeyType: 'RANGE'
				}
			} else {
				this.table.sortKey = options.table.sortKey
			}
		}

		if (options.client) {
			this.client = options.client;
		}
		else {
			if (options.AWSConfigPath) {
				AWS.config.loadFromPath(options.AWSConfigPath);
			}
			else if (options.AWSConfigJSON) {
				AWS.config.update(options.AWSConfigJSON);
			}
			else {
				this.AWSRegion = options.AWSRegion || 'us-east-1';
				AWS.config.update({region: this.AWSRegion});
			}
			this.client = new AWS.DynamoDB();
		}

		if (options.autoCreate !== false) {
			this[createTableIfNecessary](options);
		}
	}

	get(installedAppId) {
		let params = {
			TableName: this.table.name,
			Key: {
				[this.table.hashKey]: {S: this[primaryKey](installedAppId)}
			},
			ConsistentRead: true
		};

		if (this.table.sortKey) {
			params.Key[this.table.sortKey.AttributeName] = {[this.table.sortKey.AttributeType]: this.table.sortKey.AttributeValue}
		}

		return new Promise((resolve, reject) => {
			this.client.getItem(params, function(err, data) {
				if (err) {
					reject(err);
				} else {
					if (data && data.Item) {
						const item = data.Item
						resolve({
							installedAppId: AWS.DynamoDB.Converter.output(item.installedAppId),
							locationId: AWS.DynamoDB.Converter.output(item.locationId),
							authToken: AWS.DynamoDB.Converter.output(item.authToken),
							refreshToken: AWS.DynamoDB.Converter.output(item.refreshToken),
							config: AWS.DynamoDB.Converter.output(data.Item.config),
							state: AWS.DynamoDB.Converter.output(data.Item.state)
						});
					}
					else {
						resolve({});
					}
				}
			});
		});
	}

	put(params) {
		const data = {
			TableName: this.table.name,
			Item: {
				[this.table.hashKey]: {S: this[primaryKey](params.installedAppId)},
				installedAppId: {S: params.installedAppId},
				locationId: {S: params.locationId},
				authToken: {S: params.authToken},
				refreshToken: {S: params.refreshToken},
				config: AWS.DynamoDB.Converter.input(params.config),
				state: AWS.DynamoDB.Converter.input(params.state)
			}
		};

		if (this.table.sortKey) {
			data.Item[this.table.sortKey.AttributeName] = {[this.table.sortKey.AttributeType]: this.table.sortKey.AttributeValue}
		}

		return new Promise((resolve, reject) => {
			this.client.putItem(data, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			});
		});

	}

	update(installedAppId, params) {
		const names = {};
		const values = {};
		const expressions = [];
		for (const name of Object.keys(params)) {

			const expressionNameKeys = [];
			const nameSegs = name.split('.');
			for (const i in nameSegs) {
				const nameKey = `#${nameSegs.slice(0,i+1).join('_')}`;
				names[nameKey] = nameSegs[i];
				expressionNameKeys.push(nameKey)
			}
			const valueKey = `:${nameSegs.join('_')}`;
			values[valueKey] = AWS.DynamoDB.Converter.input(params[name]);
			expressions.push(`${expressionNameKeys.join('.')} = ${valueKey}`)
		}

		const data = {
			TableName: this.table.name,
			Key: {
				[this.table.hashKey]: {S: this[primaryKey](installedAppId)}
			},
			UpdateExpression: 'SET ' + expressions.join(', '),
			ExpressionAttributeNames: names,
			ExpressionAttributeValues: values
		};

		if (this.table.sortKey) {
			data.Key[this.table.sortKey.AttributeName] = {[this.table.sortKey.AttributeType]: this.table.sortKey.AttributeValue}
		}

		console.log(JSON.stringify(data, null, 2));
		return new Promise((resolve, reject) => {
			this.client.updateItem(data, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			});
		});
	}

	delete(installedAppId) {
		let params = {
			TableName: this.table.name,
			Key: {
				[this.table.hashKey]: {S: this[primaryKey](installedAppId)}
			}
		};

		if (this.table.sortKey) {
			data.Key[this.table.sortKey.AttributeName] = {[this.table.sortKey.AttributeType]: this.table.sortKey.AttributeValue}
		}

		return new Promise((resolve, reject) => {
			this.client.deleteItem(params, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			});
		});
	}

	[primaryKey](installedAppId) {
		return `${this.table.prefix}${installedAppId}`;
	}

	[createTableIfNecessary](options) {
		return this.client.describeTable({"TableName": this.table.name}).promise()
			.then(table => {
				console.log(`DynamoDB context table ${this.table.name}, exists`)
			})
			.catch(err => {
				if (err.code === 'ResourceNotFoundException') {
					console.log(`DynamoDB context table ${this.table.name}, creating`);
					const params = {
						"TableName": this.table.name,
						"AttributeDefinitions": [
							{
								"AttributeName": this.table.hashKey,
								"AttributeType": "S"
							}
						],
						"KeySchema": [
							{
								"KeyType": "HASH",
								"AttributeName": this.table.hashKey
							}
						],
						"ProvisionedThroughput": {
							"WriteCapacityUnits": options.table ? (options.table.writeCapacityUnits || 5) : 5,
							"ReadCapacityUnits": options.table ? (options.table.readCapacityUnits || 5) : 5
						}
					}

					if (this.table.sortKey) {
						params.AttributeDefinitions.push({
							"AttributeName": this.table.sortKey.AttributeName,
							"AttributeType": this.table.sortKey.AttributeType
						});
						params.KeySchema.push({
							"KeyType": this.table.sortKey.KeyType,
							"AttributeName": this.table.sortKey.AttributeName,
						})
					}

					return this.client.createTable(params).promise()
				}
				else {
					console.error('Error creating DynamoDB table %j', err);
					return new Promise((resolve, reject) => {
						reject(err)
					})
				}
			})
	}
};
