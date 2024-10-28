const prisma = require("../utils/prisma");

// Delete a notification and create a new rating
const deleteNotification = async (req, res) => {
  const notificationId = parseInt(req.params.id, 10);
  console.log(`Received request to delete notification with ID: ${notificationId}`);

  try {
    // Step 1: Find the notification by ID
    const notification = await prisma.snipxNotifications.findUnique({
      where: { id: notificationId },
      select: {
        user_id: true,
        skill_id: true,
      },
    });

    if (!notification) {
      console.log(`Notification with ID: ${notificationId} not found.`);
      return res.status(404).send('Notification not found.');
    }

    const { user_id, skill_id } = notification;
    console.log(`Found notification: User ID: ${user_id}, Skill ID: ${skill_id}`);

    // Step 2: Delete the notification
    await prisma.snipxNotifications.delete({
      where: { id: notificationId },
    });
    console.log(`Deleted notification with ID: ${notificationId}`);

    // Step 3: Get the highest score for the user and skill
    const highestRating = await prisma.snipxRating.findFirst({
      where: {
        user_id: user_id,
        skill_id: skill_id,
      },
      orderBy: {
        score: 'desc',
      },
      select: {
        score: true,
      },
    });

    console.log(`Highest rating found: ${highestRating ? highestRating.score : 'No ratings available'}`);

    // Step 4: Determine the new score
    const newScore = highestRating ? highestRating.score + 1 : 1;
    console.log(`New score to be created: ${newScore}`);

    // Create a new rating record
    await prisma.snipxRating.create({
      data: {
        user_id: user_id,
        skill_id: skill_id,
        score: newScore,
      },
    });
    console.log(`New rating created for User ID: ${user_id}, Skill ID: ${skill_id} with Score: ${newScore}`);

    res.status(200).send('Notification deleted and new rating created successfully.');
  } catch (error) {
    console.error(`Error deleting notification with ID: ${notificationId}`, error);
    res.status(500).send('Internal Server Error.');
  }
};

const getAllNotifications = async (req, res) => {
  try {
    const { id: userId } = req.body;

    // Step 1: Find the user's company ID
    const userCompanyRelation = await prisma.snipxUserCompany.findUnique({
      where: { user_id: userId },
      select: { company_id: true },
    });

    if (!userCompanyRelation) {
      console.log("User does not belong to any company.");
      return res.status(200).json([]).end();
    }

    const companyId = userCompanyRelation.company_id;

    // Step 2: Get all users in the same company
    const companyUsers = await prisma.snipxUserCompany.findMany({
      where: { company_id: companyId },
      select: { user_id: true },
    });

    const userIds = companyUsers.map((relation) => relation.user_id);

    // Step 3: Fetch notifications for users in the same company
    const notifications = await prisma.snipxNotifications.findMany({
      where: { user_id: { in: userIds } },
      include: {
        user: {
          select: {
            email: true, // Include the user's email
          },
        },
        skill: {
          select: {
            skill_name: true, // Include the skill name
          },
        },
      },
    });

    console.log(`Retrieved ${notifications.length} notifications with user emails and skill names.`);
    res.status(200).json(notifications).end();
  } catch (error) {
    console.error("Error retrieving notifications:", error);
    res.status(500).send("Internal Server Error.").end();
  }
};


module.exports = {
  deleteNotification,
  getAllNotifications,
};
