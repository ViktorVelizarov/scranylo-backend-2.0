const prisma = require("../utils/prisma");

// Upload a PDP for a given user
const uploadPDP = async (req, res) => {
  const { userId, PDPText } = req.body;

  console.log("userID:", parseInt(userId));
  console.log("Received PDP:", PDPText);

  try {
    if (!userId || !PDPText) {
      console.log("Invalid request: Missing userId or PDP text");
      return res.status(400).json({ error: "User ID and PDP text are required." }).end();
    }

    const updatedUser = await prisma.snipx_Users.update({
      where: { id: parseInt(userId) },
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
};


// Upload AI PDP to the database
const uploadAIPDP = async (req, res) => {
  const { userId, PDPText } = req.body;

  console.log("userID:", parseInt(userId));
  console.log("Received PDP for upload:", PDPText);

  try {
    if (!userId || !PDPText) {
      console.log("Invalid request: Missing userId or PDP text");
      return res.status(400).json({ error: "User ID and PDP text are required." }).end();
    }

    const updatedUser = await prisma.snipx_Users.update({
      where: { id: parseInt(userId) },
      data: {
        AI_PDP: PDPText,
      },
    });

    console.log("PDP uploaded successfully to AI_PDP field:", updatedUser);
    res.status(200).json(updatedUser).end();
  } catch (error) {
    console.error("Failed to upload PDP to AI_PDP field:", error);
    res.status(500).json({ error: "Failed to upload PDP." }).end();
  }
};

// Get PDP text of a given user
const getPDP = async (req, res) => {
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
};

module.exports = {
  uploadPDP,
  uploadAIPDP,
  getPDP,
};
