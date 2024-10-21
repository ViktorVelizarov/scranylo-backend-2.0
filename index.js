const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
const OpenAI = require("openai");
const { z } = require("zod");
const { zodResponseFormat } = require("openai/helpers/zod");
const prisma = require("./utils/prisma");
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { google } = require("googleapis");
const { getAuth } = require("firebase-admin/auth");
const { getLinks, updateCandidate } = require("./table.js");
const { getQAPath, qaUpdate } = require("./table-qa");

const { v2beta3 } = require('@google-cloud/tasks');
const { CloudTasksClient } = require('@google-cloud/tasks');

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
  findSnipxUserByEmail,
  findSnipxUserByID,
  updateSnipxUserById,
  deleteSnipxUserById,
  addNewSnipxUser,
} = require("./database/snipx_user.js");
const {
  getSkillsByCompanyId,
  createSkill,
  updateSkillByIdSNIPX,
  deleteSkillByIdSNIPX,
  getSkillsWithNoCompany,
} = require('./database/snipx_skills.js');
const {
  getTeamsForUser,
  createTeam,
  updateTeam,
  deleteTeam,
} = require('./database/snipx_teams.js');
const {
  uploadPDP,
  uploadAIPDP,
  getPDP,
} = require('./database/snipx_pdp.js');
const {
  deleteNotification,
  getAllNotifications,
} = require('./database/snipx_notifications.js');
const {
  getTasksForCompany,
  assignSkillsToTask,
  createTask,
  deleteTask,
  assignUsersToTask,
  executeTask
} = require('./database/snipx_tasks.js');
const {
  findAllSnippets,
  AddSnippet,
  findSnippetsByCompanyId,
  findSnippetsByUserCompanyId,
  findSnippetsByUserId,
  findDailySnippetsByUserId,
  updateSnippetById,
  deleteSnippetById,
  findTeamSnippets,
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
const TextAnalysisFormat = z.object({
  green: z.array(z.string()),
  orange: z.array(z.string()),
  red: z.array(z.string()),
});

const SentimentrAnalysisFormat = z.object({
  sentiment: z.string(),
  score: z.number().int(),
  explanations: z.string(),
});

const app = express();
app.use(cors());

// Increase the limit for the JSON body parser
app.use(express.json({ limit: '10mb' }));  // Set limit to 10MB
app.use(bodyParser.urlencoded({ extended: false, limit: '10mb' }));

// Create a reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,  // Gmail address from .env file
    pass: process.env.EMAIL_PASS,  // Gmail password or App Password from .env file
  },
});

const upload = multer({ storage: multer.memoryStorage() });

const keyFilePath = require("./credentials2.json");  //this is the whole file as an object
const keyFilePath2 = './credentials3.json';   //this is jsut the location of the file

// AUTO FUNC
// Initialize the Google Auth client
const auth = new google.auth.GoogleAuth({
  credentials: keyFilePath,
  scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/cloud-platform'],
});
// Create a Cloud Tasks Client with credentials
const tasksClient = new CloudTasksClient({
  keyFilename: keyFilePath2, // Use the keyFile option for Cloud Tasks
});

const docs = google.docs({ version: 'v1', auth });
const drive = google.drive({ version: 'v3', auth });


// inicialize app to use Firebase services
const serviceAccount = require("./firebaseAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// PDP Endpoints
app.post('/api/uploadPDP', uploadPDP);

// PDP
app.post('/api/analyzePDP', async (req, res) => {
  const { PDPText } = req.body; // Destructure PDPText from the request body

  console.log("Received PDP for analysis:", PDPText);

  try {
    // Validate the input
    if (!PDPText) {
      console.log("Invalid request: Missing PDP text");
      return res.status(400).json({ error: "PDP text is required." }).end();
    }

    // Create the prompt for the OpenAI model
    const promptText = `Analyze this Personal Development Plan for me: "${PDPText}"`;

    // Call OpenAI API to get the analysis
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: promptText }],

    });

    // Extract the analysis result
    const analysisResult = completion.choices[0].message.content;

    console.log("AI PDP analysis result:", analysisResult);

    // Return the AI analysis result
    res.status(200).json({ AIAnalysis: analysisResult }).end();
  } catch (error) {
    console.error("Failed to analyze PDP:", error);
    res.status(500).json({ error: "Failed to analyze PDP." }).end();
  }
});

app.post('/api/uploadAIPDP', uploadAIPDP);
app.get('/api/getPDP/:userId', getPDP);

// NOTIFICATIONS
app.delete('/api/notification/:id', deleteNotification);
app.get('/api/notifications', getAllNotifications);

// TEAMS
app.get('/api/teams', getTeamsForUser);
app.post('/api/teams', createTeam);
app.put('/api/teams/:id', updateTeam);
app.delete('/api/teams/:id', deleteTeam);

// TASKS
// Get all tasks for a company
app.get('/api/tasks/:companyID', getTasksForCompany);

// TASKS
// Assign skills to a task
app.post('/api/tasks/:taskId/assign-skills', assignSkillsToTask);

// TASKS
// Create a new task
app.post('/api/tasks', async (req, res) => {
  const { task_name, task_description, task_type, company_id, endsAt } = req.body;
  console.log("endsAt", endsAt);

  if (!task_name || !company_id) {
    return res.status(400).json({ error: 'Task name and company ID are required.' }).end();
  }

  try {
    // Convert endsAt string to Date object
    const endsAtDate = new Date(endsAt);

    // Ensure endsAt is a valid date    
    if (isNaN(endsAtDate)) {
      return res.status(400).json({ error: 'Invalid endsAt date.' }).end();
    }

    // Set the total hours
    const totalHours = (endsAtDate - new Date()) / (1000 * 60 * 60); // Calculate hours between now and ends_at

    const newTask = await prisma.snipxTask.create({
      data: {
        task_name,
        task_description: task_description || null,
        task_type: task_type || null,
        company_id: parseInt(company_id),
        ends_at: endsAtDate,
        total_hours: totalHours,
      },
    });

    // Create the Cloud Task to trigger at endsAt time
    const project = 'extension-360407'; // Replace with your project ID
    const queue = 'queue1'; // Replace with your task queue name
    const location = 'europe-central2'; // e.g., 'us-central1'
    const url = 'https://extension-360407.lm.r.appspot.com/api/task/execute'; // Your API endpoint

    const payload = JSON.stringify({ taskId: newTask.id });

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(payload).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor((endsAtDate.getTime() - 2 * 60 * 60 * 1000) / 1000), // Schedule the task for ends_at time - 2 hours for timezone
      },
    };

    const parent = tasksClient.queuePath(project, location, queue);
    await tasksClient.createTask({ parent, task });

    res.status(201).json(newTask).end();
  } catch (error) {
    console.error('Error creating new task:', error);
    res.status(500).json({ error: 'Failed to create new task.' }).end();
  }
});


// TASKS
// Delete a task by ID
app.delete('/api/tasks/:id', deleteTask);

// TASKS
// Assign users to a task
app.post('/api/tasks/assign-users', assignUsersToTask);

// TASKS
// Execute a task (triggered by an external service)
app.post('/api/task/execute', executeTask);


// SKILLS
// Get All Skills for a Company
app.get('/api/skills/:companyId', getSkillsByCompanyId);

// SKILLS
// Create a New Skill for a Company
app.post('/api/skills', createSkill);

// SKILLS
// Update a Skill by ID
app.put('/api/skills/:skillId', updateSkillByIdSNIPX);

// SKILLS
// Delete a Skill by ID
app.delete('/api/skills/:skillId', deleteSkillByIdSNIPX);

// SKILLS
// Get All Skills with a null company_id
app.get('/api/skills-no-company', getSkillsWithNoCompany);


// SNIPPETS
// get all snippets from db
app.get("/api/snipx_snippets",async (req, res) => {
  const allSnippets = await findAllSnippets();
  res.status(200).json(allSnippets).end();
});

// SNIPPETS
// Get snippets by Company ID
app.post("/api/company_snippets_ID", async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "Company ID is required" });

    const companySnippets = await findSnippetsByCompanyId(companyId);
    if (companySnippets.length === 0) return res.status(404).json({ message: "No users found for this company" });

    res.status(200).json(companySnippets);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// SNIPPETS
// Create snippet in database
app.post("/api/snipx_snippets", async (req, res) => {
  const { snipx_user_id, type, inputText, action, date, green, orange, red, explanations, score, sentiment } = req.body;
  try {
    const newSnippet = await AddSnippet({
      snipx_user_id,
      type,
      date,
      inputText,
      green,
      orange,
      red,
      explanations,
      score,
      sentiment,
      action,
    });
    res.status(201).json({ message: "Snippet data received and stored successfully", snippet: newSnippet });
  } catch (error) {
    res.status(500).json({ error: "Failed to store snippet data" });
  }
});

// SNIPPETS
// Get snippets by user ID
app.post("/api/snipx_snippets/user", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "User ID is required" });

    const userSnippets = await findSnippetsByUserId(id);
    if (userSnippets.length === 0) return res.status(404).json({ message: "No snippets found for this user" });

    res.status(200).json(userSnippets);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// SNIPPETS
// Get daily snippets by user ID
app.post("/api/snipx_snippets/user_daily", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "User ID is required" });

    const dailySnippets = await findDailySnippetsByUserId(id);
    if (dailySnippets.length === 0) return res.status(404).json({ message: "No daily snippets found for this user" });

    res.status(200).json(dailySnippets);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// SNIPPETS
// Edit a snippet by ID
app.put("/api/snipx_snippets/:id", async (req, res) => {
  const { id } = req.params;
  const { user_id, text, green, orange, red, explanations, score, sentiment } = req.body;
  try {
    const updatedSnippet = await updateSnippetById(id, { user_id, text, green, orange, red, explanations, score, sentiment });
    res.status(200).json(updatedSnippet);
  } catch (error) {
    res.status(500).json({ error: "Failed to update snippet" });
  }
});

// SNIPPETS
// Delete a snippet by ID
app.delete("/api/snipx_snippets/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await deleteSnippetById(id);
    res.status(204).json();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete snippet" });
  }
});

// SNIPPETS
// Get team snippets by Team ID
app.post("/api/team_snippets", async (req, res) => {
  try {
    const { teamId } = req.body;
    if (!teamId) return res.status(400).json({ error: "Team ID is required" });

    const teamSnippets = await findTeamSnippets(teamId);
    if (teamSnippets.length === 0) return res.status(404).json({ message: "No snippets found for this team" });

    res.status(200).json(teamSnippets);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// SNIPPETS
// Get snippets by Company ID
app.post("/api/company_snippets", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    const companySnippets = await findSnippetsByUserCompanyId(userId);
    if (companySnippets.length === 0) return res.status(404).json({ message: "No snippets found for this company" });

    res.status(200).json(companySnippets);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});




// Users API

/**
 * Update a user by ID.
 */
app.put("/api/snipx_users/:id", async (req, res) => {
  const { id } = req.params;
  const { email, role, managedBy } = req.body;
  try {
      const updatedUser = await updateSnipxUserById(id, { email, role, managedBy });
      res.status(200).json(updatedUser).end();
  } catch (error) {
      res.status(500).json({ error: "Failed to update user" }).end();
  }
});

/**
* Delete a user by ID.
*/
app.delete("/api/snipx_users/:id", async (req, res) => {
  const { id } = req.params;
  try {
      await deleteSnipxUserById(id);
      res.status(204).end();
  } catch (error) {
      res.status(500).json({ error: "Failed to delete user" }).end();
  }
});

/**
* Add a new user.
*/
app.post("/api/snipx_users", async (req, res) => {
  const { email, role, managedBy, currentUserID } = req.body;
  try {
      // Find the company of the currentUserID
      const currentUserCompany = await prisma.snipxUserCompany.findUnique({
          where: { user_id: currentUserID }
      });

      if (!currentUserCompany) {
          return res.status(404).json({ error: "Current user or their company not found" }).end();
      }

      const companyId = currentUserCompany.company_id;

      // Create the new user
      const newUser = await addNewSnipxUser({ email, role, managedBy });

      // Link the new user to the same company
      await prisma.snipxUserCompany.create({
          data: {
              user_id: newUser.id,
              company_id: companyId
          }
      });

      res.status(201).json(newUser).end();
  } catch (error) {
      res.status(500).json({ error: "Failed to create user and link to company" }).end();
  }
});

/**
* Find a user by ID.
*/
app.post("/api/snipx_users/:id", async (req, res) => {
  const { id } = req.params;
  try {
      const foundUser = await findSnipxUserByID(id);
      res.status(200).json(foundUser).end();
  } catch (error) {
      res.status(500).json({ error: "Failed to find user" }).end();
  }
});

/**
* Find users from the same company as the current user.
*/
app.post("/api/company_users", async (req, res) => {
  const { id } = req.body;
  try {
      const userCompanyRelation = await prisma.snipxUserCompany.findUnique({
          where: { user_id: id },
          include: { company: true }
      });

      if (!userCompanyRelation || !userCompanyRelation.company) {
          return res.status(404).json({ message: "User or associated company not found" });
      }

      const companyId = userCompanyRelation.company_id;

      const companyUsers = await prisma.snipxUserCompany.findMany({
          where: { company_id: companyId },
          include: { user: true }
      });

      const users = companyUsers.map(relation => relation.user);

      res.status(200).json(users).end();
  } catch (error) {
      res.status(500).json({ message: "Internal server error" }).end();
  }
});

// AUTO FUNC
app.post('/api/sendEmail', async (req, res) => {
  try {
    // Get all users from the Snipx_Users table
    const users = await prisma.snipx_Users.findMany({
      where: {
        email: {
          not: null,  // Ensure we only get users with email addresses
        },
      },
      select: {
        email: true, // Only select the email field
      },
    });

    if (!users.length) {
      return res.status(404).json({ error: "No users with valid emails found." });
    }

    const subject = "SnipX Snippet Reminder!";
    const message = "Hello, this is an automated message sent every 24h! Dont forget to fill in your snippet for the day in the SnipX app. ";

    // Send an email to each user
    for (const user of users) {
      const mailOptions = {
        from: process.env.EMAIL_USER,  // Sender address (your email)
        to: user.email,                // Receiver's email address from the database
        subject: subject,              // Hardcoded subject
        text: message,                 // Hardcoded message
      };

      await transporter.sendMail(mailOptions);
    }

    console.log(`Emails sent to ${users.length} users.`);
    res.status(200).json({ success: `Emails sent to ${users.length} users.` });
  } catch (error) {
    console.error("Error sending emails:", error);
    res.status(500).json({ error: "Failed to send emails." });
  }
});







// HOURS
// Get all user skill hours with user emails and skill names
app.get('/api/user-skill-hours', async (req, res) => {
  try {
    const userSkillHours = await prisma.snipxUserSkillHours.findMany({
      include: {
        user: {
          select: {
            email: true,  // Include the user's email
          },
        },
        skill: {
          select: {
            skill_name: true,  // Include the skill name
          },
        },
      },
    });

    console.log(`Retrieved ${userSkillHours.length} user skill hour records with emails and skill names.`);
    res.status(200).json(userSkillHours);
  } catch (error) {
    console.error('Error retrieving user skill hours:', error);
    res.status(500).send('Internal Server Error.');
  }
});




// COMPANY
// Get Company ID for a User
app.get('/api/users/:userId/company', async (req, res) => {
  const { userId } = req.params;

  try {
    const userCompany = await prisma.snipxUserCompany.findUnique({
      where: { user_id: parseInt(userId) },
      select: { company_id: true },
    });

    if (userCompany) {
      res.status(200).json({ companyId: userCompany.company_id }).end();
    } else {
      res.status(404).json({ error: "User not found or not associated with any company." }).end();
    }
  } catch (error) {
    console.error("Failed to fetch company ID:", error);
    res.status(500).json({ error: "Failed to fetch company ID." }).end();
  }
});





// RATINGS
// Get Skill Ratings for a User
app.get('/api/users/:userId/ratings', async (req, res) => {
  const { userId } = req.params;
  console.log(`Fetching skill ratings for userId: ${userId}`);

  try {
    const ratings = await prisma.snipxRating.findMany({
      where: { user_id: parseInt(userId) },
      select: {
        score: true,
        created_at: true,
        skill: {
          select: { id: true },
        },
      },
    });

    console.log('Ratings fetched successfully:', ratings);
    res.status(200).json(ratings).end();
  } catch (error) {
    console.error("Failed to fetch ratings:", error);
    res.status(500).json({ error: "Failed to fetch ratings." }).end();
  }
});

// RATINGS
// Create a new Skill Rating for a User
app.post('/api/users/:userId/ratings', async (req, res) => {
  const { userId } = req.params;
  const { skillId, score } = req.body;
  console.log(`Creating new rating for userId: ${userId}, skillId: ${skillId}, score: ${score}`);

  try {
    // Create a new rating
    const rating = await prisma.snipxRating.create({
      data: {
        user_id: parseInt(userId),
        skill_id: parseInt(skillId),
        score: score,
        created_at: new Date(), // Use the current timestamp
      },
    });

    console.log('Rating created successfully:', rating);
    res.status(200).json(rating).end();
  } catch (error) {
    console.error("Failed to create rating:", error);
    res.status(500).json({ error: "Failed to create rating." }).end();
  }
});


// PFP
// Endpoint to upload an image
app.post('/api/uploadProfilePicture', upload.single('profilePicture'), async (req, res) => {
  const { userId } = req.body;
  const profilePicture = req.file?.buffer;

  console.log("userID:", parseInt(userId));
  console.log("Received file info:", req.file);
  console.log("profilePicture:", profilePicture);
  console.log('base64 image', profilePicture.toString('base64'))

  try {
    // Validate the input
    if (!userId || !profilePicture) {
      console.log("Invalid request: Missing userId or picture file");
      return res.status(400).json({ error: "User ID and Picture file are required." }).end();
    }

    // Update the profile picture in the database
    const updatedUser = await prisma.snipx_Users.update({
      where: { id: parseInt(userId) }, // Ensure userId is an integer
      data: {
        profilePictureUrl: profilePicture.toString('base64'), // Convert binary to base64 encoded string
      },
    });

    console.log("Profile picture uploaded successfully:", updatedUser);
    res.status(200).json(updatedUser).end();
  } catch (error) {
    console.error("Failed to upload profile picture:", error);
    res.status(500).json({ error: "Failed to upload profile picture." }).end();
  }
});

// PFP
// Endpoint to retrieve a profile picture
app.get('/api/profilePicture/:userId', async (req, res) => {
  const { userId } = req.params;

  console.log("Received request to retrieve profile picture:", { userId });

  try {
    // Fetch the profile picture from the database
    const user = await prisma.snipxUser.findUnique({
      where: { id: parseInt(userId) },
      select: { profilePictureUrl: true },
    });

    if (!user || !user.profilePictureUrl) {
      console.log("Profile picture not found for userId:", userId);
      return res.status(404).json({ error: "Profile picture not found." }).end();
    }

    // Set the content type header and send the image
    res.setHeader('Content-Type', 'image/jpeg'); // Adjust as needed
    res.send(user.profilePictureUrl);
  } catch (error) {
    console.error("Failed to retrieve profile picture:", error);
    res.status(500).json({ error: "Failed to retrieve profile picture." }).end();
  }
});


// Helper function
// Helper function to create or update a Google Doc
async function createOrUpdateGoogleDoc(user, snippets) {
  // Create a new document title based on user email
  const docTitle = `Snippets for ${user.email}`;
  let documentId = null;

  console.log(`Processing user: ${user.email}`);

  try {
    // Check if the document already exists
    const res = await drive.files.list({
      q: `name='${docTitle}' and mimeType='application/vnd.google-apps.document'`,
      fields: 'files(id, name)',
    });

    if (res.data.files && res.data.files.length > 0) {
      // Document exists, get the ID
      documentId = res.data.files[0].id;
      console.log(`Document already exists for ${user.email}, updating document with ID: ${documentId}`);
    } else {
      // Create a new document
      const createResponse = await docs.documents.create({
        requestBody: {
          title: docTitle,
        },
      });
      documentId = createResponse.data.documentId;
      console.log(`Created new document for ${user.email} with ID: ${documentId}`);
    }

    // Prepare the content for the document
    const content = snippets.map(snippet => ({
      insertText: {
        text: `${snippet.date}\nType: ${snippet.type}\nGreen: ${snippet.green}\nOrange: ${snippet.orange}\nRed: ${snippet.red}\nSentiment: ${snippet.sentiment}\nScore: ${snippet.score}\nExplanations: ${snippet.explanations}\n\n`,
        location: {
          index: 1,
        },
      },
    }));

    if (content.length > 0) {
      // Retrieve the current document length
      const docRes = await docs.documents.get({
        documentId: documentId,
      });

      const docLength = docRes.data.body.content.reduce((length, element) => {
        if (element.paragraph) {
          length += (element.paragraph.elements || []).reduce((pLength, e) => pLength + (e.textRun ? e.textRun.content.length : 0), 0);
        }
        return length;
      }, 0);

      // Only delete content if there's something to delete
      if (docLength > 0) {
        const endIndex = Math.min(1000000, docLength); // Avoid overly large endIndex

        // Clear the existing content and update with new snippets
        console.log(`Clearing existing content and updating with new snippets for ${user.email}`);
        await docs.documents.batchUpdate({
          documentId: documentId,
          requestBody: {
            requests: [
              {
                deleteContentRange: {
                  range: {
                    startIndex: 1,
                    endIndex: endIndex,
                  },
                },
              },
              ...content,
            ],
          },
        });
      } else {
        console.log(`Document is empty, skipping content deletion.`);
      }
    } else {
      // No content to insert
      console.log(`No snippets found for ${user.email}. Document created but no updates needed.`);
    }

    // Share the document with a specific email
    await drive.permissions.create({
      fileId: documentId,
      requestBody: {
        role: 'writer', // Or 'reader' depending on your needs
        type: 'user',
        emailAddress: 'webs@scaleup.agency',
      },
    });

    console.log(`Successfully processed document for ${user.email} and shared with webs@scaleup.agency`);
    return documentId;
  } catch (error) {
    console.error(`Error processing document for ${user.email}:`, error);
    throw error;
  }
}

// AUTO FUNC
// API endpoint to create or update Google Docs with snippets
app.post('/api/update-google-docs', async (req, res) => {
  try {
    console.log('Received request to update Google Docs.');

    // Get all users
    const users = await prisma.snipx_Users.findMany();
    console.log(`Found ${users.length} users in the database.`);

    for (const user of users) {
      // Get all snippets for the user
      const snippets = await prisma.snipxSnippet.findMany({
        where: { user_id: user.id },
      });
      console.log(`Found ${snippets.length} snippets for user ${user.email}.`);

      // Create or update the Google Doc for the user
      await createOrUpdateGoogleDoc(user, snippets);
    }

    console.log('All Google Docs updated successfully.');
    res.status(200).send('Google Docs updated successfully.');
  } catch (error) {
    console.error('Error updating Google Docs:', error);
    res.status(500).send('Internal Server Error');
  }
});



// AUTO FUNC
// Helper function to create or update a Google Doc for PDP
async function createOrUpdatePDPDoc(user) {
  const docTitle = `PDP for ${user.email}`;
  let documentId = null;

  console.log(`Processing PDP for user: ${user.email}`);

  try {
    // Check if the document already exists
    const res = await drive.files.list({
      q: `name='${docTitle}' and mimeType='application/vnd.google-apps.document'`,
      fields: 'files(id, name)',
    });

    if (res.data.files && res.data.files.length > 0) {
      // Document exists, get the ID
      documentId = res.data.files[0].id;
      console.log(`Document already exists for ${user.email}, updating document with ID: ${documentId}`);
    } else {
      // Create a new document
      const createResponse = await docs.documents.create({
        requestBody: {
          title: docTitle,
        },
      });
      documentId = createResponse.data.documentId;
      console.log(`Created new document for ${user.email} with ID: ${documentId}`);
    }

    // Prepare the content for the PDP document
    const pdpText = user.PDP || 'No PDP provided.';
    const content = [
      {
        insertText: {
          text: `Personal Development Plan (PDP)\n\n${pdpText}\n`,
          location: {
            index: 1,
          },
        },
      },
    ];

    // Retrieve the current document content
    const docRes = await docs.documents.get({
      documentId: documentId,
    });

    const docLength = docRes.data.body.content.reduce((length, element) => {
      if (element.paragraph) {
        length += (element.paragraph.elements || []).reduce((pLength, e) => pLength + (e.textRun ? e.textRun.content.length : 0), 0);
      }
      return length;
    }, 0);

    if (docLength > 1) {
      const endIndex = Math.min(1000000, docLength);

      // Clear the existing content and update with new PDP content
      console.log(`Clearing existing content and updating PDP for ${user.email}`);
      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: [
            {
              deleteContentRange: {
                range: {
                  startIndex: 1,
                  endIndex: endIndex,
                },
              },
            },
            ...content,
          ],
        },
      });
    } else {
      // If the document is empty, just insert new content without deleting
      console.log(`Document is empty, skipping content deletion for ${user.email}. Inserting PDP content.`);
      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: content,
        },
      });
    }

    // Share the document with a specific email
    await drive.permissions.create({
      fileId: documentId,
      requestBody: {
        role: 'writer',
        type: 'user',
        emailAddress: 'webs@scaleup.agency',
      },
    });

    console.log(`Successfully processed PDP document for ${user.email} and shared with webs@scaleup.agency`);
    return documentId;
  } catch (error) {
    console.error(`Error processing PDP document for ${user.email}:`, error);
    throw error;
  }
}

// AUTO FUNC
// API endpoint to create or update Google Docs with PDPs
app.post('/api/update-google-pdps', async (req, res) => {
  try {
    console.log('Received request to update PDP Google Docs.');

    // Get all users in the company
    const users = await prisma.snipx_Users.findMany({
      where: { company: { isNot: null } }, // Filter users with a company
    });
    console.log(`Found ${users.length} users in the company.`);

    for (const user of users) {
      console.log(`Processing PDP for user ${user.email}.`);

      // Create or update the PDP Google Doc for the user
      await createOrUpdatePDPDoc(user);
    }

    console.log('All PDP Google Docs updated successfully.');
    res.status(200).send('PDP Google Docs updated successfully.');
  } catch (error) {
    console.error('Error updating PDP Google Docs:', error);
    res.status(500).send('Internal Server Error');
  }
});




// endpoints below are part of the SCRANYLO Google Extenion and NOT a part of the SNIPX app

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



app.post("/api/weeklySnippet", async (req, res) => {
  const { snippetIds } = req.body;


  // Check if snippetIds is provided and is an array
  if (!Array.isArray(snippetIds) || snippetIds.length === 0) {
      return res.status(400).json({ error: "Snippet IDs are required and should be an array." });
  }

  try {
      // Convert snippetIds from strings to integers
      const snippetIdsInt = snippetIds.map(id => parseInt(id, 10));
      console.log("Converted snippet IDs:", snippetIdsInt);

      // Fetch the snippets based on the provided IDs
      const snippets = await prisma.snipxSnippet.findMany({
          where: {
              id: { in: snippetIdsInt } // Use the integer IDs here
          },
          select: {
              text: true, // Select the text field
              date: true,  // Also select the date field
              score: true
          }
      });

      // Extract the text values and dates from the snippets
      const snippetDetails = snippets.map(snippet => ({
          text: snippet.text,
          date: snippet.date ? snippet.date : null // Format date as YYYY-MM-DD
      })).filter(detail => detail.text && detail.date); // Filter out any snippets without text or date

      console.log("snippet details:", snippetDetails);

      if (snippetDetails.length === 0) {
          return res.status(404).json({ error: "No snippets found for the provided IDs." });
      }

      // Prepare the prompt for OpenAI
      const promptText = `
          I will give you the snippets for 5 days where I say what tasks I worked on during the week on my job.
          Can you summarize the 5 days and create a snippet for the whole week as a weekly report?
          Here are the snippets with their corresponding dates:
          ${snippetDetails.map(detail => `${detail.date}: ${detail.text}`).join(' ')}
      `;


      // Make a request to OpenAI with the prompt
      const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: promptText }],
      });

      const result = completion.choices[0].message.content;



      res.status(200).json({ weeklyReport: result });
  } catch (error) {
      console.error("Error:", error.message);
      res.status(500).json({ error: "Failed to create weekly report" });
  }
});


// OPENAI API
// New route for OpenAI text analysis of Snippets
app.post("/api/analyze", async (req, res) => {
  const { text } = req.body;

  try {
    const promptText = `You are a professional reporting and journaling tool. You will receive a daily report from and employee and your job is to summarize the daily report into a concise analysis for a manager. 

Highlight the main pain points and successes, using the following indicators 
GREEN: for positive points
ORANGE: for neutral points
RED: for negative points

Organize the summary by key areas, and ensure each sentence begins with the appropriate indicator. Focus on providing actionable insights and overall progress. The concise analysis can not be longer than 5 sentences and each sentence is also concise, short and clear. 

DON'T put any emojis in the text! 

OUTPUT:
Always return the result in a JSON format.: "${text}"`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: promptText }],
      response_format: zodResponseFormat(TextAnalysisFormat, "result_format"),
      temperature: 0.15, // Adjust temperature here
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

// OPENAI API
// New route for OpenAI sentiment analysis of Snippets
app.post("/api/sentimentAnalysis", async (req, res) => {
  const { text } = req.body;
  console.log("in /api/sentimentAnalysis")
  try {
    const promptText = `Write me a sentiment analysis of this daily work snippet in json format.
     I want 3 fields. The first field is "sentiment" which is true or false according to if the sentiment analysis
      is positive or negative.The second field is "score" which is JUST A NUMBER value from f1 to 10 corresponding
       to the sentiment. The third field is "explanations" which gives a description of the sentiment analysis: "${text}"`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: promptText }],
      response_format: zodResponseFormat(SentimentrAnalysisFormat, "sentiment_format"),
    });

    const result = completion.choices[0].message.content;

    const parsedResult = JSON.parse(result);

    console.log(parsedResult);

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
      const result = await findSnipxUserByEmail(email);
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
  