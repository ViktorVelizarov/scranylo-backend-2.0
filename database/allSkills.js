const prisma = require("../utils/prisma");
const skillsArray = require("./../skillsWithJobs");

// get all "all skills" from the database and order them from newest to oldest also for each skill include data about ech connected to it job from the ext_job_skill and ext_jobs tables
const getAllSkills = async () => {
  const allSkills = await prisma.allSkills.findMany({
    orderBy: { id: "desc" },
    include: {
      jobs: {
        include: {
          job: true,
        },
      },
    },
  });
  return allSkills;
};

// create new skill in the ext_all_skills and connect it to all relevant jobs in the ext_job_skill table
const createNewSkill = async (data) => {
  // Prepare skill for checking on duplicates in the database
  const processedSkill = data.skill
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/—/g, " ")
    .replace(/\s+/g, " ");
  // get all existing skills from the database
  const skills = await prisma.allSkills.findMany();

  for (let i = 0; i < skills.length; i++) {
    // Each existing skill is also processed in the same way as the new one
    const existingSkill = skills[i].name
      .toLowerCase()
      .replace(/-/g, " ")
      .replace(/—/g, " ")
      .replace(/\s+/g, " ");
    // Check on duplicates
    if (processedSkill === existingSkill) {
      console.log("This skill already exists in the database");
      return existingSkill;
    }
  }
  // If new skill is unique, then add it to the database
  const newSkill = await prisma.allSkills.create({
    data: {
      name: data.skill,
    },
  });
  // connect skill to related jobs in the ext_job_skill table
  for (let job of data.connectedJobs) {
    await prisma.jobSkill.create({
      data: {
        jobId: job.id,
        skillId: newSkill.id,
      },
    });
  }
  return newSkill;
};

// update existing skill in the ext_all_skills and connections to related jobs in the ext_job_skill table 
const updateSkillById = async (data) => {
  const updatedSkill = await prisma.allSkills.update({
    where: { id: data.id },
    data: {
      name: data.name,
    },
  });
  await prisma.jobSkill.deleteMany({
    where: { skillId: parseInt(updatedSkill.id) },
  });
  for (let job of data.connectedJobs) {
    await prisma.jobSkill.create({
      data: {
        jobId: job.id,
        skillId: updatedSkill.id,
      },
    });
  }
  return updatedSkill;
};

// delete selected skill from the ext_all_skills and all connections to related jobs (ext_job_skill) or sourced candidates (dtb_candidate_skill)
const deleteSkillById = async (skillId) => {
  await prisma.jobSkill.deleteMany({
    where: { skillId: parseInt(skillId) },
  });
  await prisma.candidateSkill.deleteMany({
    where: { skillId: parseInt(skillId) },
  });
  const deletedSkill = await prisma.allSkills.delete({
    where: { id: parseInt(skillId) },
  });
  return deletedSkill;
};

// Create regex from all skills in the ext_all_skills so it can be used by sourcing extension for scraping
const getRegexForAllSkills = async () => {
  const allSkills = await getAllSkills();
  const skillsNames = allSkills.map((skill) => {
    const regexSkill = skill.name
      .toLowerCase()
      .replace(/[\.\*\+\?\^\$\{\}\(\)\|\[\]\\/]/g, "\\$&") // convert it to lowercase, replace regex special characters with the escaped version
      .replace(/\s+/g, "\\s+"); // collapse multiple spaces into a single space.
    // Check if the second character of 'regexSkill' is a dot '.'
    if (regexSkill.indexOf(".") === 1) {
      // pattern will match if the skill name appears at the end of a word, for skills like ".Net"
      return `(${regexSkill}\\b)`;
    } else {
      // pattern will match if the skill name appears as a standalone word
      return `(\\b${regexSkill}\\b)`;
    }
  });
  const finalRegex = `(?:${skillsNames.join("|")})`;
  return finalRegex;
};

// backup function to fill ext_all_skills table with skills from the ./skillsWithJobs.js file
const uploadSkills = async () => {
  for (const skills of skillsArray) {
    try {
      const skill = await prisma.allSkills.create({
        data: {
          name: skills.skill,
        },
      });
      console.log(`Added skill: ${skill.name}`);
    } catch (error) {
      console.error(`Error adding skill: ${skills.skill}`);
      console.error(error);
    }
  }
};

module.exports = {
  getAllSkills,
  getRegexForAllSkills,
  createNewSkill,
  deleteSkillById,
  updateSkillById,
};
