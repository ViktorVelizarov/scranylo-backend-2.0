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
  findAllSnippets,
  AddSnippet,
  findSnippetsByUserId,
  updateSnippetById,
  deleteSnippetById,
  findDailySnippetsByUserId,
  
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

// Get All Skills for a Company
app.get('/api/skills/:companyId', async (req, res) => {
  const { companyId } = req.params;
  console.log(`Fetching skills for companyId: ${companyId}`);

  try {
    const skills = await prisma.snipxSkill.findMany({
      where: { company_id: parseInt(companyId) },
      select: {
        id: true,
        skill_name: true,
        desc1: true,
        desc2: true,
        desc3: true,
        desc4: true,
        desc5: true,
        ratings: {
          select: {
            score: true,
          },
        },
      },
    });

    console.log('Skills fetched successfully:', skills);
    res.status(200).json(skills).end();
  } catch (error) {
    console.error("Failed to fetch skills:", error);
    res.status(500).json({ error: "Failed to fetch skills." }).end();
  }
});

// Get all tasks for a specific company, including whether users are assigned
app.get('/api/tasks/:companyID', async (req, res) => {
  const { companyID } = req.params;

  try {
    const tasks = await prisma.snipxTask.findMany({
      where: {
        company_id: parseInt(companyID),
      },
      select: {
        id: true,
        task_name: true,
        task_description: true,
        task_type: true,
        created_at: true,
        assignedUsers: {  // Correctly reference the assignedUsers relation
          select: {
            user_id: true,  // Include user_id or any other user fields you need
          },
        },
      },
    });

    // Map tasks and include a flag if users are assigned
    const tasksWithUserAssignment = tasks.map((task) => ({
      ...task,
      hasUsersAssigned: task.assignedUsers.length > 0,  // Check if there are any assigned users
    }));

    res.status(200).json(tasksWithUserAssignment).end();
  } catch (error) {
    console.error('Error fetching tasks for company:', error);
    res.status(500).json({ error: 'Failed to fetch tasks for company.' }).end();
  }
});

// Endpoint to get all skills with a null company_id
app.get('/api/skills-no-company', async (req, res) => {
  try {
    const skills = await prisma.snipxSkill.findMany({
      where: {
        company_id: null,
      },
    });

    return res.status(200).json(skills);
  } catch (error) {
    console.error('Error fetching skills with null company_id:', error);
    return res.status(500).json({ error: 'Failed to fetch skills.' });
  }
});

// Endpoint to add skills to a task
app.post('/api/tasks/:taskId/assign-skills', async (req, res) => {
  const { taskId } = req.params;
  let { skill_ids, score } = req.body;

  // Ensure skill_ids is an array and score is a number
  score = Number(score); // Convert score to a number
  console.log("received ids:", skill_ids);
  console.log("received score:", score);

  if (!Array.isArray(skill_ids) || skill_ids.length === 0 || isNaN(score)) {
    return res.status(400).json({ error: 'Invalid input data.' });
  }

  try {
    console.log("test");

    // Loop through each skill_id and create a new entry in SnipxTaskSkill
    const assignments = await Promise.all(
      skill_ids.map(skill_id => {
        return prisma.snipxTaskSkill.create({
          data: {
            task: { connect: { id: parseInt(taskId) } }, // Connect to the task
            skill: { connect: { id: parseInt(skill_id) } }, // Connect to the skill
            score: score,
          },
        });
      })
    );

    return res.status(201).json({ message: 'Skills assigned to task successfully!', assignments });
  } catch (error) {
    console.error('Error assigning skills to task:', error);
    return res.status(500).json({ error: 'Failed to assign skills to task.' });
  }
});



// Create a new task
app.post('/api/tasks', async (req, res) => {
  const { task_name, task_description, task_type, company_id } = req.body;

  if (!task_name || !company_id) {
    return res.status(400).json({ error: 'Task name and company ID are required.' }).end();
  }

  try {
    const newTask = await prisma.snipxTask.create({
      data: {
        task_name,
        task_description: task_description || null,
        task_type: task_type || null,
        company_id: parseInt(company_id),
      },
    });

    res.status(201).json(newTask).end();
  } catch (error) {
    console.error('Error creating new task:', error);
    res.status(500).json({ error: 'Failed to create new task.' }).end();
  }
});

// Delete a task by ID
app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Check if the task exists
    const taskExists = await prisma.snipxTask.findUnique({
      where: { id: parseInt(id) },
    });

    if (!taskExists) {
      return res.status(404).json({ error: 'Task not found.' }).end();
    }

    // Delete the task
    await prisma.snipxTask.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({ message: 'Task deleted successfully.' }).end();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task.' }).end();
  }
});




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



//uplaod a PDP to a given user in the snippets user table
app.post('/api/uploadPDP', async (req, res) => {
  const { userId, PDPText } = req.body; // Destructure userId and PDPText from the request body

  console.log("userID:", parseInt(userId));
  console.log("Received PDP:", PDPText);

  try {
    // Validate the input
    if (!userId || !PDPText) {
      console.log("Invalid request: Missing userId or PDP text");
      return res.status(400).json({ error: "User ID and PDP text are required." }).end();
    }

    const updatedUser = await prisma.snipx_Users.update({
      where: { id: parseInt(userId) }, // Ensure userId is an integer
      data: {
        PDP: PDPText, 
      },
    });

    console.log("PDP uploaded successfully:", updatedUser);
    res.status(200).json(updatedUser).end();
  } catch (error) {
    console.error("Failed to upload PDP:", error);
    res.status(500).json({ error: "Failed to upload PDP." }).end();
  }
});

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

app.post('/api/uploadAIPDP', async (req, res) => {
  const { userId, PDPText } = req.body; // Destructure userId and PDPText from the request body

  console.log("userID:", parseInt(userId));
  console.log("Received PDP for upload:", PDPText);

  try {
    // Validate the input
    if (!userId || !PDPText) {
      console.log("Invalid request: Missing userId or PDP text");
      return res.status(400).json({ error: "User ID and PDP text are required." }).end();
    }

    // Store the provided PDPText directly in the AI_PDP field in the database
    const updatedUser = await prisma.snipx_Users.update({
      where: { id: parseInt(userId) }, // Ensure userId is an integer
      data: {
        AI_PDP: PDPText, // Save the provided PDPText in the AI_PDP field
      },
    });

    console.log("PDP uploaded successfully to AI_PDP field:", updatedUser);
    res.status(200).json(updatedUser).end();
  } catch (error) {
    console.error("Failed to upload PDP to AI_PDP field:", error);
    res.status(500).json({ error: "Failed to upload PDP." }).end();
  }
});


//get the PDP text of a given user from the snippets users table
app.get('/api/getPDP/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.snipx_Users.findUnique({
      where: { id: parseInt(userId) },
      select: { PDP: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" }).end();
    }

    res.status(200).json({ PDP: user.PDP }).end();
  } catch (error) {
    console.error("Failed to retrieve PDP:", error);
    res.status(500).json({ error: "Failed to retrieve PDP." }).end();
  }
});

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




// Get All Skills for a Company
app.get('/api/skills/:companyId', async (req, res) => {
  const { companyId } = req.params;
  console.log(`Fetching skills for companyId: ${companyId}`);

  try {
    const skills = await prisma.snipxSkill.findMany({
      where: { company_id: parseInt(companyId) },
      select: {
        id: true,
        skill_name: true,
        desc1: true,
        desc2: true,
        desc3: true,
        desc4: true,
        desc5: true,
        ratings: {
          select: {
            score: true,
          },
        },
      },
    });

    console.log('Skills fetched successfully:', skills);
    res.status(200).json(skills).end();
  } catch (error) {
    console.error("Failed to fetch skills:", error);
    res.status(500).json({ error: "Failed to fetch skills." }).end();
  }
});

// Create a New Skill for a Company
app.post('/api/skills', async (req, res) => {
  const { skillName, companyId, desc1, desc2, desc3, desc4, desc5 } = req.body;
  console.log(`Creating skill: ${skillName} for companyId: ${companyId}`);

  try {
    const newSkill = await prisma.snipxSkill.create({
      data: {
        skill_name: skillName,
        company_id: parseInt(companyId),
        desc1,
        desc2,
        desc3,
        desc4,
        desc5,
      },
    });

    console.log('Skill created successfully:', newSkill);
    res.status(201).json(newSkill).end();
  } catch (error) {
    console.error("Failed to create skill:", error);
    res.status(500).json({ error: "Failed to create skill." }).end();
  }
});

// Update a Skill by ID
app.put('/api/skills/:skillId', async (req, res) => {
  const { skillId } = req.params;
  const { skillName, desc1, desc2, desc3, desc4, desc5 } = req.body;
  console.log(`Updating skillId: ${skillId} to new name: ${skillName}`);

  try {
    const updatedSkill = await prisma.snipxSkill.update({
      where: { id: parseInt(skillId) },
      data: {
        skill_name: skillName,
        desc1,
        desc2,
        desc3,
        desc4,
        desc5,
      },
    });

    console.log('Skill updated successfully:', updatedSkill);
    res.status(200).json(updatedSkill).end();
  } catch (error) {
    console.error("Failed to update skill:", error);
    res.status(500).json({ error: "Failed to update skill." }).end();
  }
});


// Delete a Skill by ID
app.delete('/api/skills/:skillId', async (req, res) => {
  const { skillId } = req.params;
  console.log(`Deleting skillId: ${skillId}`);

  try {
    await prisma.snipxSkill.delete({
      where: { id: parseInt(skillId) },
    });

    console.log('Skill deleted successfully:', skillId);
    res.status(200).json({ message: "Skill deleted successfully." }).end();
  } catch (error) {
    console.error("Failed to delete skill:", error);
    res.status(500).json({ error: "Failed to delete skill." }).end();
  }
});


// Assign multiple users to a task
app.post('/api/tasks/assign-users', async (req, res) => {
  const { task_id, user_ids } = req.body;

  if (!task_id || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'Task ID and an array of user IDs are required.' }).end();
  }

  try {
    // Ensure all user-task relations are added to the SnipxTaskUser table
    const createTaskUserRelations = user_ids.map((userId) =>
      prisma.snipxTaskUser.create({
        data: {
          task_id: parseInt(task_id),
          user_id: parseInt(userId),
        },
      })
    );

    // Wait for all the user-task relations to be created
    await Promise.all(createTaskUserRelations);

    res.status(200).json({ message: 'Users successfully assigned to the task.' }).end();
  } catch (error) {
    console.error('Error assigning users to task:', error);
    res.status(500).json({ error: 'Failed to assign users to task.' }).end();
  }
});



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





const upload = multer({ storage: multer.memoryStorage() });

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




// Add a new user
app.post("/api/snipx_users", async (req, res) => {
  const { email, role, managedBy, currentUserID } = req.body;
  console.log("currentUserID:", currentUserID);
  console.log("managedBy", managedBy)
  try {
    // Step 1: Find the company of the currentUserID
    const currentUserCompany = await prisma.snipxUserCompany.findUnique({
      where: { user_id: currentUserID },
    });
    console.log("currentUserCompany")
    console.log(currentUserCompany)

    if (!currentUserCompany) {
      return res.status(404).json({ error: "Current user or their company not found" }).end();
    }

    const companyId = currentUserCompany.company_id;

    // Step 2: Create the new user
    const newUser = await addNewSnipxUser({ email, role, managedBy });

    // Step 3: Link the new user to the same company
    await prisma.snipxUserCompany.create({
      data: {
        user_id: newUser.id,
        company_id: companyId,
      },
    });

    res.status(201).json(newUser).end();
  } catch (error) {
    console.error("Failed to create user or link to company:", error);
    res.status(500).json({ error: "Failed to create user and link to company" }).end();
  }
});

// Find a user by ID
app.post("/api/snipx_users/:id", async (req, res) => {
  const { id } = req.params;

  console.log("find by id id:", id)
  try {
    const foundUser = await findSnipxUserByID(id);
    console.log("foundUser:", foundUser)
    res.status(200).json(foundUser).end();
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" }).end();
  }
});


// Endpoint to get all snippets for a given team
app.post("/api/team_snippets", async (req, res) => {
  try {
    // Extract teamId from the query string and convert it to an integer
    const { teamIdReq } = req.body;
    const teamId = parseInt(teamIdReq, 10);

    console.log("Received request to fetch snippets for team ID:", teamId);

    // Check if teamId is valid
    if (isNaN(teamId)) {
      console.log("Team ID is missing or is not a valid number.");
      return res.status(400).json({ message: "Team ID is required and must be a number" }).end();
    }

    // Step 1: Find all users in the specified team
    const teamMembers = await prisma.snipxUserTeam.findMany({
      where: { team_id: teamId },
      include: {
        user: true // Include user details
      }
    });

    if (teamMembers.length === 0) {
      console.log("No users found in team ID:", teamId);
      return res.status(404).json({ message: "No users found in the specified team" }).end();
    }

    // Extract user IDs from the team members
    const userIds = teamMembers.map(member => member.user_id);

    console.log(`User IDs in team ID ${teamId}:`, userIds);

    // Step 2: Fetch all snippets for these users
    const snippets = await prisma.snipxSnippet.findMany({
      where: {
        user_id: { in: userIds }
      },
      orderBy: { date: 'desc' }
    });

    console.log(`Snippets found for team ID ${teamId}:`, snippets);

    // Return the snippets
    res.status(200).json(snippets).end();
  } catch (error) {
    console.error("Error fetching snippets for team:", error);
    res.status(500).json({ message: "Internal server error" }).end();
  }
});



app.get("/api/teams", async (req, res) => {
  try {
    // Extract userId from the query string and convert it to an integer
    const userId = parseInt(req.query.userId, 10); // Use parseInt to ensure userId is an integer

    console.log("Received request to fetch teams for user ID:", userId);

    // Check if userId is properly extracted and is a valid number
    if (isNaN(userId)) {
      console.log("User ID is missing or is not a valid number.");
      return res.status(400).json({ message: "User ID is required and must be a number" }).end();
    }

    // Step 1: Find the user's company through SnipxUserCompany
    const userCompanyRelation = await prisma.snipxUserCompany.findUnique({
      where: { user_id: userId },  // userId is now an integer
      include: { company: true },
    });

    console.log("User-Company Relation:", userCompanyRelation);

    if (!userCompanyRelation || !userCompanyRelation.company) {
      console.log("No associated company found for user ID:", userId);
      return res.status(404).json({ message: "User or associated company not found" }).end();
    }

    const companyId = userCompanyRelation.company_id;

    // Step 2: Find all teams associated with the company
    const teams = await prisma.snipxTeams.findMany({
      where: { company_id: companyId },
      include: {
        teamMembers: {
          include: {
            user: true // Fetch user details to get their snippets
          }
        }
      }
    });

    console.log("Teams found:", teams);

    // Function to calculate the average score for a user
    const calculateAverageScore = async (userId) => {
      // Get the last 5 snippets for the user
      console.log(`Fetching last 5 snippets for user ID: ${userId}`);
      const snippets = await prisma.snipxSnippet.findMany({
        where: { user_id: userId },
        orderBy: { date: 'desc' },
        take: 5
      });

      console.log(`Snippets fetched for user ID ${userId}:`, snippets);

      // Calculate average score
      const scores = snippets.map(snippet => parseFloat(snippet.score) || 0);
      console.log(`Scores for user ID ${userId}:`, scores);

      const averageScore = scores.length > 0 ? scores.reduce((acc, score) => acc + score, 0) / scores.length : 0;
      console.log(`Calculated average score for user ID ${userId}: ${averageScore}`);

      return averageScore;
    };

    // Calculate average score for each team
    const teamsWithAverageScores = await Promise.all(teams.map(async (team) => {
      console.log(`Calculating average score for team ID: ${team.id}, Team Name: ${team.team_name}`);

      // Get all user IDs for the team
      const userIds = team.teamMembers.map(member => member.user_id);
      console.log(`User IDs in team ID ${team.id}:`, userIds);

      // Calculate average score for each user
      const userScores = await Promise.all(userIds.map(userId => calculateAverageScore(userId)));
      console.log(`User scores for team ID ${team.id}:`, userScores);

      const averageScore = userScores.length > 0 ? userScores.reduce((acc, score) => acc + score, 0) / userScores.length : 0;
      console.log(`Calculated average score for team ID ${team.id}: ${averageScore}`);

      // Return team with calculated average score
      return {
        ...team,
        average_score: averageScore
      };
    }));

    res.status(200).json(teamsWithAverageScores).end();
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).json({ message: "Internal server error" }).end();
  }
});




// Create a new team and add users to it
app.post("/api/teams", async (req, res) => {
  try {
    // Extract data from the request body
    const { teamName, userIds, currentUserId } = req.body; // userIds is an array of user IDs to add to the team

    // Convert userIds and currentUserId to integers
    const userIdsInt = userIds.map(id => parseInt(id, 10));
    const currentUserIdInt = parseInt(currentUserId, 10);

    console.log("Received request to create a team with name:", teamName);
    console.log("User IDs to add to the team:", userIdsInt);
    console.log("Current user ID:", currentUserIdInt);

    // Step 1: Find the company of the current user
    const currentUserCompany = await prisma.snipxUserCompany.findUnique({
      where: { user_id: currentUserIdInt }, // user_id as integer
    });

    console.log("Current User's Company Relation:", currentUserCompany);

    if (!currentUserCompany) {
      return res.status(404).json({ message: "Current user or their company not found" }).end();
    }

    const companyId = currentUserCompany.company_id;

    // Step 2: Create the new team associated with the user's company
    const newTeam = await prisma.snipxTeams.create({
      data: {
        team_name: teamName,
        company_id: companyId,
      },
    });

    console.log("New team created:", newTeam);

    // Step 3: Add each user to the team (ensure users belong to the same company)
    const userTeamPromises = userIdsInt.map(async (userId) => {
      // Check if the user belongs to the same company
      const userCompany = await prisma.snipxUserCompany.findUnique({
        where: { user_id: userId }, // user_id as integer
      });

      console.log(`Checking if user with ID ${userId} belongs to company ID ${companyId}`);

      if (userCompany && userCompany.company_id === companyId) {
        // Add user to the team
        return prisma.snipxUserTeam.create({
          data: {
            user_id: userId,
            team_id: newTeam.id,
          },
        });
      } else {
        // Return a rejected promise if user doesn't belong to the company
        return Promise.reject(new Error(`User with ID ${userId} is not in the same company.`));
      }
    });

    // Wait for all promises to resolve or reject
    await Promise.allSettled(userTeamPromises);

    res.status(201).json({ message: "Team created and users added successfully", team: newTeam }).end();
  } catch (error) {
    console.error("Error creating team or adding users:", error);
    res.status(500).json({ message: "Failed to create team and add users" }).end();
  }
});


// Update team details
app.put("/api/teams/:id", async (req, res) => {
  try {
    // Extract team ID from the request parameters
    const teamId = parseInt(req.params.id, 10);
    // Extract data from the request body
    const { team_name, userIds } = req.body;

    console.log("Received request to update team ID:", teamId);
    console.log("Updated team name:", team_name);
    console.log("User IDs to update:", userIds);

    // Ensure team ID is a valid number
    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid team ID" }).end();
    }

    // Step 1: Update the team details
    const updatedTeam = await prisma.snipxTeams.update({
      where: { id: teamId },
      data: { team_name: team_name },
    });

    console.log("Team updated:", updatedTeam);

    // Step 2: Remove existing team members
    await prisma.snipxUserTeam.deleteMany({
      where: { team_id: teamId },
    });

    console.log("Removed existing team members");

    // Step 3: Add new team members
    const userTeamPromises = userIds.map(async (userId) => {
      // Convert userId to integer
      const userIdInt = parseInt(userId, 10);

      // Check if the user belongs to the same company (this step may vary based on your logic)
      const userCompany = await prisma.snipxUserCompany.findUnique({
        where: { user_id: userIdInt },
      });

      if (userCompany) {
        return prisma.snipxUserTeam.create({
          data: {
            user_id: userIdInt,
            team_id: teamId,
          },
        });
      } else {
        return Promise.reject(new Error(`User with ID ${userIdInt} is not valid.`));
      }
    });

    // Wait for all promises to resolve or reject
    await Promise.allSettled(userTeamPromises);

    res.status(200).json({ message: "Team updated successfully", team: updatedTeam }).end();
  } catch (error) {
    console.error("Error updating team:", error);
    res.status(500).json({ message: "Failed to update team" }).end();
  }
});



// Delete a team
app.delete("/api/teams/:id", async (req, res) => {
  try {
    // Extract team ID from the request parameters
    const teamId = parseInt(req.params.id, 10);

    console.log("Received request to delete team ID:", teamId);

    // Ensure team ID is a valid number
    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid team ID" }).end();
    }

    // Step 1: Delete team members
    await prisma.snipxUserTeam.deleteMany({
      where: { team_id: teamId },
    });

    console.log("Deleted team members");

    // Step 2: Delete the team
    await prisma.snipxTeams.delete({
      where: { id: teamId },
    });

    console.log("Team deleted");

    res.status(200).json({ message: "Team deleted successfully" }).end();
  } catch (error) {
    console.error("Error deleting team:", error);
    res.status(500).json({ message: "Failed to delete team" }).end();
  }
});




app.post("/api/company_users", async (req, res) => {
  try {
    // Step 1: Extract the user who sent the request
    const { id } = req.body;
    console.log("id")
    console.log(id)

    // Step 2: Find the user's company through SnipxUserCompany
    const userCompanyRelation = await prisma.snipxUserCompany.findUnique({
      where: { user_id: id },
      include: { company: true },
    });

    console.log("userCompanyRelation")
    console.log(userCompanyRelation)

    if (!userCompanyRelation || !userCompanyRelation.company) {
      return res.status(404).json({ message: "User or associated company not found" });
    }

    const companyId = userCompanyRelation.company_id;

    console.log("companyId")
    console.log(companyId)

    // Step 3: Find all users associated with the same company
    const companyUsers = await prisma.snipxUserCompany.findMany({
      where: { company_id: companyId },
      include: { user: true },
    });


    // Extract the users from the relations
    const users = companyUsers.map((relation) => relation.user);


    // Step 4: Return the users in the response
    res.status(200).json(users).end();
  } catch (error) {
    console.error("Error fetching company users:", error);
    res.status(500).json({ message: "Internal server error" }).end();
  }
});

const keyFilePath = require("./credentials2.json");


// Initialize the Google Auth client
const auth = new google.auth.GoogleAuth({
  credentials: keyFilePath,
  scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive'],
});


const docs = google.docs({ version: 'v1', auth });
const drive = google.drive({ version: 'v3', auth });


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




// Edit a user by ID
app.put("/api/snipx_users/:id", async (req, res) => {
  const { id } = req.params;
  const { email, role, managedBy } = req.body;
  console.log("managedBy edit:", managedBy)
  try {
    const updatedUser = await updateSnipxUserById(id, { email, role, managedBy });
    res.status(200).json(updatedUser).end();
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" }).end();
  }
});

// Delete a user by ID
app.delete("/api/snipx_users/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await deleteSnipxUserById(id);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" }).end();
  }
});

// get all snippets from db
app.get("/api/snipx_snippets",async (req, res) => {
  const allSnippets = await findAllSnippets();
  res.status(200).json(allSnippets).end();
});


// Get snippets by Company ID
app.post("/api/company_snippets_ID", async (req, res) => {
  try {
    // Step 1: Extract the company ID from the request body
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" }).end();
    }

    // Step 2: Find all users associated with the provided company ID
    const companyUsers = await prisma.snipxUserCompany.findMany({
      where: {
        company_id: companyId,
      },
      select: { user_id: true },
    });

    if (companyUsers.length === 0) {
      return res.status(404).json({ message: "No users found for this company" }).end();
    }

    const userIds = companyUsers.map((relation) => relation.user_id);
    console.log("userIds in company:", userIds);

    // Step 3: Find all snippets associated with the users in that company
    const companySnippets = await prisma.snipxSnippet.findMany({
      where: {
        user_id: {
          in: userIds,
        },
      },
    });

    console.log("companySnippets:", companySnippets);

    // Step 4: Return the snippets in the response
    res.status(200).json(companySnippets).end();
  } catch (error) {
    console.error("Error fetching company snippets:", error);
    res.status(500).json({ message: "Internal server error" }).end();
  }
});



// Get Company Snippets by user Id
app.post("/api/company_snippets", async (req, res) => {
  try {
    // Step 1: Extract the user ID from the request body
    const { id } = req.body;
    console.log("id:", id);

    // Step 2: Find the user's company through SnipxUserCompany
    const userCompanyRelation = await prisma.snipxUserCompany.findUnique({
      where: { user_id: id },
      include: { company: true },
    });

    console.log("userCompanyRelation:", userCompanyRelation);

    if (!userCompanyRelation || !userCompanyRelation.company) {
      return res.status(404).json({ message: "User or associated company not found" });
    }

    const companyId = userCompanyRelation.company_id;
    console.log("companyId:", companyId);

    // Step 3: Find all users associated with the same company
    const companyUsers = await prisma.snipxUserCompany.findMany({
      where: {
        company_id: companyId,
        user: {           // This condition relates to the associated Snipx_Users model
          managedBy: id    // Check if the managedBy field is equal to 1
        }
      },
      select: { user_id: true },
    });

    const userIds = companyUsers.map((relation) => relation.user_id);
    console.log("userIds in company:", userIds);

    // Step 4: Find all snippets associated with the users in that company
    const companySnippets = await prisma.snipxSnippet.findMany({
      where: {
        user_id: {
          in: userIds,
        },
      },
    });

    console.log("companySnippets:", companySnippets);

    // Step 5: Return the snippets in the response
    res.status(200).json(companySnippets).end();
  } catch (error) {
    console.error("Error fetching company snippets:", error);
    res.status(500).json({ message: "Internal server error" }).end();
  }
});






// Get snippets by user ID
app.post("/api/snipx_snippets/user", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: "User ID is required" }).end();
    }

    const userSnippets = await findSnippetsByUserId(id);


    if (userSnippets.length === 0) {
      return res.status(404).json({ message: "No snippets found for this user" }).end();
    }

    res.status(200).json(userSnippets).end();
  } catch (error) {
    console.error("Error fetching user snippets:", error);
    res.status(500).json({ error: "Internal Server Error" }).end();
  }
});

// Get only daily snippets by user ID
app.post("/api/snipx_snippets/user_daily", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: "User ID is required" }).end();
    }

    const userSnippets = await findDailySnippetsByUserId(id);

    if (userSnippets.length === 0) {
      return res.status(404).json({ message: "No snippets found for this user" }).end();
    }

    res.status(200).json(userSnippets).end();
  } catch (error) {
    console.error("Error fetching user snippets:", error);
    res.status(500).json({ error: "Internal Server Error" }).end();
  }
});


// Edit a snippet by ID
app.put("/api/snipx_snippets/:id", async (req, res) => {
  const { id } = req.params;
  const { user_id, text, green, orange, red, explanations, score, sentiment } = req.body;

  try {
    const updatedSnippet = await updateSnippetById(id, {
      user_id,
      text,
      green,
      orange,
      red,
      explanations,
      score,
      sentiment,
    });
    console.log("updatedSnippet")
    console.log(updatedSnippet)
    res.status(200).json(updatedSnippet).end();
  } catch (error) {
    res.status(500).json({ error: "Failed to update snippet" }).end();
  }
});

// Delete a snippet by ID
app.delete("/api/snipx_snippets/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await deleteSnippetById(id);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete snippet" }).end();
  }
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


// New route for OpenAI sentiment analysis of Snippets
app.post("/api/sentimentAnalysis", async (req, res) => {
  const { text } = req.body;
  console.log("in /api/sentimentAnalysis")
  try {
    const promptText = `Write me a sentiment analysis of this daily work snippet in json format.
     I want 3 fields. The first field is "sentiment" which is true or false according to if the sentiment analysis
      is positive or negative.The second field is "score" which is JUST A NUMBER value from 1 to 10 corresponding
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


// Handle SnipX sent snippets from users of SnipX
app.post("/api/snipx_snippets", async (req, res) => {
  const { snipx_user_id, type, inputText, date, green, orange, red, explanations, score, sentiment } = req.body;
  // Log the received data to the console
  console.log("Received SnipX snippet data:");
  console.log("user_id:", snipx_user_id);
  console.log("type:", type);
  console.log("date", date)
  console.log("Input Text:", inputText);
  console.log("Green Snippets:", green);
  console.log("Orange Snippets:", orange);
  console.log("Red Snippets:", red);

  console.log("explanations:", explanations);
  console.log("score:", score);
  console.log("sentiment:", sentiment);

  try {
    // Add the snippet to the database
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
      sentiment
    });

    // Respond with the newly created snippet
    res.status(201).json({
      message: "Snippet data received and stored successfully",
      snippet: newSnippet,
    });
  } catch (error) {
    console.error("Error storing snippet:", error);
    res.status(500).json({ error: "Failed to store snippet data" });
  }
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
  