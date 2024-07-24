const { google } = require("googleapis");
const credentials = require("./credentials.json");
// const spreadsheetId = "1l_1lfAkoF-0AcmIeHUtshTW3gFy7c5Po_dIOZXRoQ9M";
const spreadsheetId = "10s0jBpUjJ1lY6Ba-5VNj9NWWDqXNtHVFVkWGwT-bxXo";
const { getAllRules } = require("./database/job");
const { findAdminByEmail} = require("./database/user");
const { createUpdateReview } = require("./database/review");
const { increaseTotalReviewed } = require("./database/dailyQAStats");

// The authorize function is responsible for creating a new Google API JWT client for making authorized requests.
async function authorize() {
  const JwtClient = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return JwtClient;
}

// The function is used to authorize and gather candidate data for a QA session based on setted criteria.
const getQAPath = async (data) => {
  const email = `${data.owner.toLowerCase()}@scaleup.agency`;
  // If the email exists of the user that is doing QA in the database and it is an admin, the rest of the function is executed
  if (await findAdminByEmail(email)) {
    data.rules = await getAllRules("admin");
    authorize()
      .then(async (res) => {
        await getCandidates(res, data);
      })
      .catch(console.error);
  } else {
    console.log("unathorised user!");
    data.response.status(500);
    data.response.json({ error: `You are not allowed to use that extension!` });
    data.response.end();
  }
};

// Update candidates data with checked data by QA and update stats for the user who is doing QA
const qaUpdate = async (data) => {
  authorize()
    .then(async (res) => {
      await updateCandidate(res, data);
    })
    .catch(console.error);
};

// Retrieve candidates from the Google Spreadsheet, filter them be given criteria and return final list of rows to the Googel Spreadsheet
const getCandidates = async (JwtClient, data) => {
  const sheets = google.sheets({ version: "v4", auth: JwtClient });
  sheets.spreadsheets.values.get(
    {
      spreadsheetId: spreadsheetId,
      range: "List of candidates for QA!A:AA",
    },
    async (err, res) => {
      if (err) {
        console.log("The API returned an error: " + err);
        data.response.status(500);
        data.response.json({
          error: `Something went wrong!`,
        });
        data.response.end();
      }
      const rows = res.data.values;
      // regex to test if there is an owner setted for candidate
      const regex = new RegExp("^([a-zA-Z]{1,})$", "mi");
      // set value for relevancy filter
      let isRelevant =
        data.filterRelevant === "relevant"
          ? "yes"
          : data.filterRelevant === "unrelevant"
          ? "no"
          : "both";
      // Filtered rows by relevancy and job and choose rows only with owner (reviewed rows)
      const filteredRows = rows
        .map((row, key) => {
          row.unshift(key + 1);
          return row;
        })
        .filter((row) => {
          if (isRelevant === "both") {
            return (
              row.length &&
              row[24] &&
              // filter by job
              row[24].toLowerCase() === data.filterJob.toLowerCase() &&
              regex.test(row[2]) &&
              !row[21]
            );
          } else {
            // Conditions for 'relevant' and 'unrelevant' relevancy
            return (
              row.length &&
              row[2] &&
              row[24] &&
              regex.test(row[2]) &&
              row[24].toLowerCase() === data.filterJob.toLowerCase() &&
              // filter by relevancy
              row[5].toLowerCase() === isRelevant &&
              !row[21]
            );
          }
        });
      // Choose given amount of rows from filtered rows equally from all parts of the spreadsheet
      const result = await chooseRows(filteredRows, data.candidatesNum);
      // If result array contains elements, status 200 and data is sent, otherwise error message is sent with status 500
      if (result.length) {
        data.response.status(200);
        data.response.json({
          // create objects from arrays with candidates' data so it will be easier to work with them
          path: await arraysToObjects(result),
          rules: data.rules,
        });
        data.response.end();
      } else {
        data.response.status(500);
        data.response.json({
          error: `The application hasn't found any candidates that match the selected filters, please try selecting other filters.`,
        });
        data.response.end();
      }
    }
  );
};

// Filter sort rows (candidates) by owner 
const chooseRows = async (rows, count) => {
  // A dictionary is created to store the rows, grouped by owner
  const rowsByOwner = {};
  for (let i in rows) {
    const childArray = rows[i];
    const string = childArray[2];
    // If an owner does not exist in the dictionary, an entry is created for them
    if (!rowsByOwner[string]) {
      rowsByOwner[string] = [];
    }
    // The row is added to the owner's entry in the dictionary
    rowsByOwner[string].push(childArray);
  }
  // The final result array is created, using reservoir sampling to gettin equal amount of rows from each owner and from each part of spreadsheet
  let result = [];
  for (let i in rowsByOwner) {
    const ownerRows = rowsByOwner[i];
    result = result.concat(await reservoirSampling(ownerRows, count));
  }
  // The final result is sorted by Google Spreadsheet index (original order of profiles in the spreadheet)
  return result.sort((a, b) => a[0] - b[0]);
};

// Standard implementation of the reservoir sampling algorithm
const reservoirSampling = async (arr, k) => {
  let reservoir = arr.slice(0, k);
  for (let i = k; i < arr.length; i++) {
    const j = Math.floor(Math.random() * (i + 1));
    if (j < k) {
      reservoir[j] = arr[i];
    }
  }
  return reservoir;
};

// Array to object so it will be easier to work with data
const arraysToObjects = async (path) => {
  const finalPath = [];
  for (let i in path) {
    const candidateObj = {
      index: path[i][0],
      name: path[i][1],
      owner: path[i][2],
      status: path[i][3],
      transfered: path[i][4],
      relevant: path[i][5],
      LIprofileOld: path[i][6],
      LIprofileNew: path[i][7],
      connections: path[i][8],
      currentRole: path[i][9],
      country: path[i][10],
      university: path[i][11],
      yearOfGrad: path[i][12],
      currentCompany: path[i][13],
      yrsInCurrentComp: path[i][14],
      totalExp: path[i][15],
      seniority: path[i][16],
      jobType: path[i][17],
      skills: path[i][18],
      reachoutTopic: path[i][19],
      reachoutComment: path[i][20],
      qaScore: path[i][21],
      qaComment: path[i][22],
    };
    finalPath.push(candidateObj);
  }
  return finalPath;
};

// Function will find user in the Google spreadsheet by id and update data with data checked by QA, also function will create a review object that will contain data before QA and after with QA score and comments, finally function will update QA stats.
const updateCandidate = async (JwtClient, data) => {
  const sheets = google.sheets({ version: "v4", auth: JwtClient });
  const candidate = data.candidate.candidateNewData;
  let skills = candidate.skills.join(", ");
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `List of candidates for QA!A${data.candidate.candidateIndex}:Z${data.candidate.candidateIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: {
        majorDimension: "ROWS",
        values: [
          [
            candidate.name,
            candidate.owner.trim(),
            candidate.status,
            ,
            candidate.relevant,
            ,
            candidate.url,
            candidate.connections,
            candidate.currentPosition,
            ,
            candidate.university,
            candidate.gradYear,
            candidate.currentCompany,
            candidate.yearInCurrent,
            candidate.experience,
            ,
            candidate.currentType,
            skills,
            candidate.reachoutTopic,
            candidate.reachoutComment,
            data.candidate.qaScore,
            data.candidate.qaComment,
            ,
            candidate.sourcingJob,
          ],
        ],
      },
    }).data;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const review = {
      qaOwner: data.candidate.qaOwner,
      comment: data.candidate.qaComment,
      score: data.candidate.qaScore,
      date: today,
      oldData: data.candidate.candidateUnchangedData,
      newData: data.candidate.candidateNewData,
    };
    await createUpdateReview(review);
    await increaseTotalReviewed(review);
    data.response.status(200);
    data.response.json({
      status: `The data for the candidate with the name ${candidate.name} has been added on the row: ${data.candidate.candidateIndex}`,
    });
    data.response.end();
  } catch (err) {
    console.log(err);
    data.response.status(500);
    data.response.json({
      status: "Update faild",
    });
    data.response.end();
  }
};

module.exports = {
  getQAPath,
  qaUpdate,
};
