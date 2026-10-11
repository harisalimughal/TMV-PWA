const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
let stage = "configuration";

function target(uri, fallback) {
  const url = new URL(uri);
  return { hosts: url.host.toLowerCase(), database: decodeURIComponent(url.pathname.slice(1)) || fallback };
}

function stagingConfig(config = dotenv.parse(fs.readFileSync(path.join(__dirname, "../.env")))) {
  const uri = config.LOCAL_MONGODB_URI_PRE_PROD_SWITCH?.trim();
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new Error("Staging variable must contain a MongoDB URI; no fallback is allowed.");
  const fallback = config.MONGODB_DB_NAME?.trim() || "tmv_pwa";
  const staging = target(uri, fallback);
  const production = config.MONGODB_URI ? target(config.MONGODB_URI, fallback) : null;
  if (production && staging.hosts === production.hosts &&
    (staging.database === production.database || staging.database === fallback)) {
    throw new Error("Staging and production resolve to the same host/database; refusing connection.");
  }
  return { config, uri, database: staging.database };
}

async function main() {
  const { uri, database } = stagingConfig();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 12000, connectTimeoutMS: 12000, maxPoolSize: 2 });
  try {
    stage = "connect";
    await client.connect();
    const db = client.db(database);
    stage = "driver-read";
    const driver = await db.collection("driver_accounts").findOne({ email: "hello@themanvan.co.uk", initials: "MA" },
      { projection: { _id: 0, active: 1, initials: 1, imei: 1 } });
    if (!driver) throw new Error("MA/email account not found in the selected staging database.");
    stage = "jobs-read";
    const jobs = await db.collection("jobs").find({ driverInitials: "MA" }, { projection: {
      _id: 0, jobId: 1, status: 1, bookedStart: 1, bookedEnd: 1, actualStart: 1, actualFinish: 1,
      manualDetailsRequiredAt: 1, gpsliveImei: 1, timeBilling: 1, chargesFrozenAt: 1
    }, maxTimeMS: 10000 }).sort({ bookedStart: -1 }).limit(100).toArray();
    stage = "summaries-read";
    const summaries = await db.collection("driver_job_summaries").find({ jobId: { $in: jobs.map(job => job.jobId) } },
      { projection: { _id: 0, jobId: 1, schemaVersion: 1 }, maxTimeMS: 10000 }).limit(101).toArray();
    stage = "collections-read";
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
    const gpsCounts = {};
    for (const name of names.filter(name => /^(gps_|road_charge)/.test(name))) {
      gpsCounts[name] = await db.collection(name).estimatedDocumentCount({ maxTimeMS: 10000 });
    }
    stage = "index-read";
    const indexes = names.includes("driver_job_summaries") ? await db.collection("driver_job_summaries").listIndexes().toArray() : [];
    console.log(JSON.stringify({ mode: "staging-read-only", productionTargetIsDifferent: true,
      activeDriver: driver.active, trackerAssigned: !!driver.imei, jobsScanned: jobs.length,
      statuses: jobs.reduce((acc, job) => ({ ...acc, [job.status]: (acc[job.status] || 0) + 1 }), {}),
      jobs: jobs.map(job => ({ jobId: job.jobId, status: job.status, bookedStart: job.bookedStart,
        bookedEnd: job.bookedEnd, actualStart: job.actualStart, actualFinish: job.actualFinish,
        manualRequired: !!job.manualDetailsRequiredAt, manualExists: summaries.some(row => row.jobId === job.jobId),
        trackerLinked: !!job.gpsliveImei, billingSnapshot: !!job.timeBilling })), gpsCounts,
      summaryJobIndex: indexes
        .some(index => index.unique && index.key.jobId === 1 && Object.keys(index.key).length === 1)
    }, null, 2));
  } finally { await client.close(); }
}
module.exports = { stagingConfig };
if (require.main === module) main().catch(error => { console.error(`Staging inventory failed at ${stage} (${error.name || "Error"}, code ${error.code ?? "none"}); credentials and connection details withheld.`); process.exitCode = 1; });
