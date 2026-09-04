const server = require("../index");
const { startResearchAutoSync } = require("../services/research-sync");

startResearchAutoSync();

module.exports = server;
