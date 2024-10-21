const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all skills for a company by companyId
const getSkillsByCompanyId = async (req, res) => {
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
    res.status(200).json(skills);
  } catch (error) {
    console.error("Failed to fetch skills:", error);
    res.status(500).json({ error: "Failed to fetch skills." });
  }
};

// Create a new skill for a company
const createSkill = async (req, res) => {
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
    res.status(201).json(newSkill);
  } catch (error) {
    console.error("Failed to create skill:", error);
    res.status(500).json({ error: "Failed to create skill." });
  }
};

// Update a skill by ID
const updateSkillByIdSNIPX = async (req, res) => {
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
    res.status(200).json(updatedSkill);
  } catch (error) {
    console.error("Failed to update skill:", error);
    res.status(500).json({ error: "Failed to update skill." });
  }
};

// Delete a skill by ID
const deleteSkillByIdSNIPX = async (req, res) => {
  const { skillId } = req.params;
  console.log(`Deleting skillId: ${skillId}`);

  try {
    await prisma.snipxSkill.delete({
      where: { id: parseInt(skillId) },
    });

    console.log('Skill deleted successfully:', skillId);
    res.status(200).json({ message: "Skill deleted successfully." });
  } catch (error) {
    console.error("Failed to delete skill:", error);
    res.status(500).json({ error: "Failed to delete skill." });
  }
};

// Get all skills with a null company_id
const getSkillsWithNoCompany = async (req, res) => {
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
};

module.exports = {
  getSkillsByCompanyId,
  createSkill,
  updateSkillByIdSNIPX,
  deleteSkillByIdSNIPX,
  getSkillsWithNoCompany,
};
