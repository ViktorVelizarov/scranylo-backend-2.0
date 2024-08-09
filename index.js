const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");
const OpenAI = require("openai");
const { z } = require("zod");
const { zodResponseFormat } = require("openai/helpers/zod");

const { getAuth } = require("firebase-admin/auth");
const { getLinks, updateCandidate } = require("./table.js");
const { getQAPath, qaUpdate } = require("./table-qa");
const {
  addNewUser,
  updateUserById,
  deleteUserById,
  findAllUsers,
  findAdminByEmail,
} = require("./database/user.js");
const {
  findSnipxAllUsers,
  findSnipxAdminByEmail,
} = require("./database/snipx_user.js");
const {
  findAllSnippets,
} = require("./database/snipx_snippets.js");
const {
  getAllJobs,
  createJob,
  updateJob,
  deleteJob,
} = require("./database/job.js");
const { getAllReviews, deleteReview } = require("./database/review");
const { getDailyQAStats } = require("./database/dailyQAStats");
const { getDailyStats } = require("./database/dailyStats");
const {
  getAllSkills,
  createNewSkill,
  deleteSkillById,
  updateSkillById,
} = require("./database/allSkills");
const {
  deleteConnection,
  getJobConnectionsWithSkill,
} = require("./database/allSkillJob");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the expected result format using Zod
const ResultFormat = z.object({
  green: z.array(z.string()),
  orange: z.array(z.string()),
  red: z.array(z.string()),
});

const app = express();

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// inicialize app to use Firebase services
const serviceAccount = require("./firebaseAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Uses sourcing extension. Get link to the next/previous candidate in the spreadsheet, rules, stats and all skills for the sourcer
app.get("/api", async (req, res) => {
  const data = {
    name: req.query.name,
    owner: req.query.owner.trim(),
    url: req.query.link,
    mode: req.query.mode, //receive the sorucing mode - people or company
    response: res,
  };
  getLinks(data);
});

// New route for OpenAI text analysis of Snippets
app.post("/api/analyze", async (req, res) => {
  const { text } = req.body;

  try {
    const promptText = `Summarize the following daily report into a concise analysis for a manager. Highlight the main pain points and successes, using the indicators 🟢 for positive points, 🟠 for neutral points and 🔴 for negative points. Organize the summary by key areas, and ensure each sentence begins with the appropriate indicator. Focus on providing actionable insights and overall progress. The concise analysis can not be longer than 5 bullet points and each bullet point is also concise, short and clear. Return the result in the given JSON format: "${text}"`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: promptText }],
      response_format: zodResponseFormat(ResultFormat, "result_format"),
    });

    const result = completion.choices[0].message.content;

    const parsedResult = JSON.parse(result);
    console.log("Result:");
    console.log(parsedResult);
    console.log("green3:");
    console.log(parsedResult.green)

    res.status(200).json(parsedResult);
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to analyze text" });
  }
});

// Uses sourcing extension. Update candidate's data and stats for the sourcer
app.post("/api", async (req, res) => {
  const candidateData = req.body;
  candidateData["response"] = res;
  console.log("api post res:")
  console.log(candidateData["response"])
  updateCandidate(candidateData);
});

// get all snippets from db
app.get("/api/snipx_snippets",async (req, res) => {
  const allSnippets = await findAllSnippets();
  console.log("allSnippets:")
  console.log(allSnippets)
  res.status(200).json(allSnippets).end();
});


// handle SnipX sent snippets from users of snipx
app.post("/api/snipx_snippets", (req, res) => {
  const {snipx_user_id, inputText, green, orange, red } = req.body;

  // Log the received data to the console
  console.log("Received SnipX snippet data:");
  console.log("user_id", snipx_user_id)
  console.log("Input Text:", inputText);
  console.log("Green Snippets:", green);
  console.log("Orange Snippets:", orange);
  console.log("Red Snippets:", red);

  // Send a response back to the client
  res.status(200).json({ message: "Snippet data received successfully" });
});


//  Uses relevancy web. Authenticate user on login
app.post("/api/auth/firebase", async (req, res) => {
  const idToken = req.body.idToken;
  // Verify user's token with Firebase
  getAuth()
    .verifyIdToken(idToken)
    .then(async (decodedToken) => {
      const email = decodedToken.email;
      const result = await findAdminByEmail(email);
      res.status(200).json(result).end();
    })
    .catch((error) => {
      console.log(error);
      res.status(500).json(error).end();
    });
});

//  Authenticates users based on the snipx_user table in db
app.post("/api/snipx_auth/firebase", async (req, res) => {
  const idToken = req.body.idToken;
  // Verify user's token with Firebase
  getAuth()
    .verifyIdToken(idToken)
    .then(async (decodedToken) => {
      const email = decodedToken.email;
      const result = await findSnipxAdminByEmail(email);
      console.log("snipx admin user: ")
      console.log(result)
      res.status(200).json(result).end();
    })
    .catch((error) => {
      console.log(error);
      res.status(500).json(error).end();
    });
});

// Uses relevancy web. Get all jobs in the database
app.get("/api/jobs", async (req, res) => {
  const result = await getAllJobs();
  res.status(200).json(result).end();
});

// Uses relevancy web.  Create new job
app.post("/api/job", async (req, res) => {
  const newJob = req.body;
  const result = await createJob(newJob);
  res.status(200).json(result).end();
});

// Uses relevancy web. Update existing job
app.put("/api/job", async (req, res) => {
  const updatedJob = req.body;
  const result = await updateJob(updatedJob);
  res.status(200).json(result).end();
});

// Uses relevancy web. Delete job.
app.delete("/api/job", async (req, res) => {
  const jobId = req.query.jobId;
  const result = await deleteJob(jobId);
  res.status(200).json(result).end();
});

// Uses QA extension. Verify, if user is in database and has "admin" role, then create list of candidates (rows) to check, which would match the given filters and length restriction. Return qa path (list of candidates) and 
app.get("/api/qa-path", async (req, res) => {
  const data = {
    owner: req.query.QAOwner.trim(),
    candidatesNum: req.query.candidatesNum,
    filterRelevant: req.query.filterRelevant,
    filterJob: decodeURIComponent(req.query.filterJob),
    response: res,
  };
  await getQAPath(data);
});

// Uses QA extension. Update candidate with corrected by QA user data, also update QA user's stats and create "review" object for relevancy web that will show QA score, comment and corrected data
app.post("/api/qa-update", async (req, res) => {
  const data = {
    candidate: req.body,
    response: res,
  };
  await qaUpdate(data);
});

// Uses relevancy web. Get stats for QA users for /qa-statistics page
app.get("/api/qa-stats", async (req, res) => {
  const result = await getDailyQAStats();
  res.status(200).json(result).end();
});

// Uses relevancy web. Get all reviews in the database for the /reviews page
app.get("/api/reviews", async (req, res) => {
  const reviews = await getAllReviews();
  res.status(200).json(reviews).end();
});

// Uses relevancy web. Delete selected review on the /reviews page
app.delete("/api/review", async (req, res) => {
  const reviewId = req.query.reviewId;
  const updatedReviews = await deleteReview(reviewId);
  res.status(200).json(updatedReviews).end();
});

// Uses relevancy web. Get sourcers' stats for the /statistics page
app.get("/api/stats", async (req, res) => {
  const result = await getDailyStats();
  res.status(200).json(result).end();
});

// Uses relevancy web. Get all "all skills" and related for them job for the /all-skills page 
app.get("/api/all-skills", async (req, res) => {
  const allSkills = await getAllSkills();
  res.status(200).json(allSkills).end();
});

// Uses relevancy web. Create new skill for "all skill" database and connect it to relevant jobs on the /all-skills page and /home/form page
app.post("/api/all-skills", async (req, res) => {
  const newSkill = req.body;
  await createNewSkill(newSkill);
  const updatedSkills = await getAllSkills();
  res.status(200).json(updatedSkills).end();
});

// Uses relevancy web. Update existing skill in "all skill" database and connections to related jobs on the /all-skills page
app.put("/api/all-skills", async (req, res) => {
  const updatedSkill = req.body;
  await updateSkillById(updatedSkill);
  const updatedSkills = await getAllSkills();
  res.status(200).json(updatedSkills).end();
});

// Uses relevancy web. Delete selected skill from "all skills" database and remove all connections from this skill to jobs and sourced candidates
app.delete("/api/all-skills", async (req, res) => {
  const skillId = req.query.skillId;
  await deleteSkillById(skillId);
  const updatedSkills = await getAllSkills();
  res.status(200).json(updatedSkills).end();
});

// Uses relevancy web. Get all users of extensions (sourcing and QA) adn relevancy web with their roles. "admin" role gives access to relevancy web and QA extension for the /users page
app.get("/api/users", async (req, res) => {
  const allUsers = await findAllUsers();
  res.status(200).json(allUsers).end();
});

// Get all snipx_users
app.get("/api/snipx_users", async (req, res) => {
  const allUsers = await findSnipxAllUsers();
  res.status(200).json(allUsers).end();
});

// Uses relevancy web. Add new user and it's role to the database on the /users page. 
app.post("/api/users", async (req, res) => {
  const newUser = req.body;
  await addNewUser(newUser);
  const updatedUsers = await findAllUsers();
  res.status(200).json(updatedUsers).end();
});

// Uses relevancy web. Update existing user in the database on the /users page
app.put("/api/users", async (req, res) => {
  const updatedUser = req.body;
  await updateUserById(updatedUser);
  const updatedUsers = await findAllUsers();
  res.status(200).json(updatedUsers).end();
});

// Uses relevancy web. Delete selected user by id on the /users page
app.delete("/api/users", async (req, res) => {
  const userId = req.query.userId;
  await deleteUserById(userId);
  const updatedUsers = await findAllUsers();
  res.status(200).json(updatedUsers).end();
});

// Uses relevancy web. Get all skills from the "ext_all_skills" table connected to specific job on the /home/form page after connecting new "all skill" to the job 
app.get("/api/skill-job", async (req, res) => {
  if(req.query.jobId){
    const jobId = req.query.jobId;
    const updatedConnections = await getJobConnectionsWithSkill(jobId);
    res.status(200).json(updatedConnections).end();
  }else{
    res.status(500).end();
  }
})

// Uses relevancy web. Deletes connection of selected skills from the "ext_all_skills" table on the /home/form page 
app.delete("/api/skill-job", async (req, res) => {
  const skillId = req.query.skillId;
  const jobId = req.query.jobId;
  await deleteConnection(skillId, jobId);
  const updatedConnections = await getJobConnectionsWithSkill(jobId);
  res.status(200).json(updatedConnections).end();
})

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listen on localhost:${PORT}...`);
});
