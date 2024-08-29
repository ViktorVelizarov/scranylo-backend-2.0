const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");
const OpenAI = require("openai");
const { z } = require("zod");
const { zodResponseFormat } = require("openai/helpers/zod");
const prisma = require("./utils/prisma");

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
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));


// Get all teams in the user's organization
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
      include: { teamMembers: true }, // Including team members
    });

    console.log("Teams found:", teams);

    res.status(200).json(teams).end();
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
      // Check if the user belongs to the same company (this step may vary based on your logic)
      const userCompany = await prisma.snipxUserCompany.findUnique({
        where: { user_id: userId },
      });

      if (userCompany) {
        return prisma.snipxUserTeam.create({
          data: {
            user_id: userId,
            team_id: teamId,
          },
        });
      } else {
        return Promise.reject(new Error(`User with ID ${userId} is not valid.`));
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

    console.log("companyUsers")
    console.log(companyUsers)

    // Extract the users from the relations
    const users = companyUsers.map((relation) => relation.user);

    console.log("users")
    console.log(users)

    // Step 4: Return the users in the response
    res.status(200).json(users).end();
  } catch (error) {
    console.error("Error fetching company users:", error);
    res.status(500).json({ message: "Internal server error" }).end();
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




const keyFilePath = require("./credentials2.json");

console.log("keyFilePath:")
console.log(keyFilePath)


// Initialize the Google Auth client
const auth = new google.auth.GoogleAuth({
  credentials: keyFilePath,
  scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive'],
});

// Google Docs API instance
const docs = google.docs({ version: 'v1', auth });
const drive = google.drive({ version: 'v3', auth });


async function createOrUpdateGoogleDoc(user, snippets) {
  const docTitle = `Snippets for ${user.email}`;
  let documentId = null;

  try {
      const res = await drive.files.list({
          q: `name='${docTitle}' and mimeType='application/vnd.google-apps.document'`,
          fields: 'files(id, name)',
      });

      if (res.data.files && res.data.files.length > 0) {
          documentId = res.data.files[0].id;
      } else {
          const createResponse = await docs.documents.create({
              requestBody: { title: docTitle },
          });
          documentId = createResponse.data.documentId;
      }

      const docRes = await docs.documents.get({ documentId });
      let docLength = docRes.data.body.content.reduce((length, element) => {
          if (element.endIndex) {
              return Math.max(length, element.endIndex);
          }
          return length;
      }, 1);

      let currentIndex = docLength;

      const requests = [];

      // Clear existing content
      if (docLength > 1) {
          requests.push({
              deleteContentRange: {
                  range: { startIndex: 1, endIndex: docLength - 1 },
              },
          });
          currentIndex = 1;
      }

      for (const snippet of snippets) {
          // Insert a newline if necessary
          if (currentIndex > 1) {
              requests.push({
                  insertText: {
                      text: '\n',
                      location: { index: currentIndex },
                  },
              });
              currentIndex += 1;
          }

          // Insert snippet header
          requests.push({
              insertText: {
                  text: `Snippets - ${snippet.date}\n`,
                  location: { index: currentIndex },
              },
          });
          requests.push({
              updateParagraphStyle: {
                  range: { startIndex: currentIndex, endIndex: currentIndex + `Snippets - ${snippet.date}\n`.length },
                  paragraphStyle: { namedStyleType: 'HEADING_1' },
                  fields: 'namedStyleType',
              },
          });
          currentIndex += `Snippets - ${snippet.date}\n`.length;

          // Insert table
          requests.push({
              insertTable: {
                  rows: 7,
                  columns: 1,
                  location: { index: currentIndex },
              },
          });
          currentIndex += 1;

          const fields = ['Type', 'Green', 'Orange', 'Red', 'Sentiment', 'Score', 'Explanations'];
          for (const field of fields) {
              requests.push({
                  insertText: {
                      text: `${field}: ${snippet[field.toLowerCase()]}\n`,
                      location: { index: currentIndex },
                  },
              });
              currentIndex += `${field}: ${snippet[field.toLowerCase()]}\n`.length;
          }

          requests.push({
              createParagraphBullets: {
                  range: {
                      startIndex: currentIndex - fields.length * 20,
                      endIndex: currentIndex,
                  },
                  bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
              },
          });
      }

      // Batch update document with all requests
      if (requests.length > 0) {
          await docs.documents.batchUpdate({
              documentId: documentId,
              requestBody: { requests },
          });
      }

      // Sharing document
      await drive.permissions.create({
          fileId: documentId,
          requestBody: {
              role: 'writer',
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

app.post('/api/update-google-docs', async (req, res) => {
  try {
      const users = await prisma.snipx_Users.findMany();
      for (const user of users) {
          const snippets = await prisma.snipxSnippet.findMany({
              where: { user_id: user.id },
          });
          await createOrUpdateGoogleDoc(user, snippets);
      }

      res.status(200).send('Google Docs updated successfully.');
  } catch (error) {
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
  console.log("allSnippets:")
  console.log(allSnippets)
  res.status(200).json(allSnippets).end();
});

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
    console.log("User Snippets:", userSnippets);

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
    console.log("User Snippets:", userSnippets);

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
  console.log("snippetIds:", snippetIds);

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
      console.log("chosen snippets:", snippets);
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

      console.log("Prompt for OpenAI:", promptText);

      // Make a request to OpenAI with the prompt
      const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: promptText }],
      });

      const result = completion.choices[0].message.content;

      console.log("weeklyReport result:", result);

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
    console.log("Bresult")
    console.log(result)
    const parsedResult = JSON.parse(result);
    console.log("Result:");
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
