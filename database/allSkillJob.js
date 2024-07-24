const prisma = require("../utils/prisma");
const skillsArray = require("./../skillsWithJobs");

// delete connections betweeb skill and job in the ext_job_skill table
const deleteConnection = async (skillId, jobId) => {
  const deletedConnection = await prisma.jobSkill.deleteMany({
    where: {
      skillId: parseInt(skillId),
      jobId: parseInt(jobId),
    },
  });
  return deletedConnection;
};

// get all connected skills to the given job using data from the ext_job_skill and ext_all_skills tables
const getJobConnectionsWithSkill = async (jobId) => {
  const connections = await prisma.jobSkill.findMany({
    where: {
      jobId: parseInt(jobId),
    },
    include: {
      skill: true,
    },
  });
  return connections;
};

// backup function to fill ext_job_skill table to create Many:Many database connection between skills from ./skillsWithJobs.js file and their corresponding jobs.
const connectJobsToSkills = async () => {
  for (let skillJobMapping of skillsArray) {
    const { id: skillId } = await prisma.allSkills.upsert({
      where: { name: skillJobMapping.skill },
      update: {},
      create: { name: skillJobMapping.skill },
    });
    for (let jobTitle of skillJobMapping.jobs) {
      const { id: jobId } = await prisma.jobs.upsert({
        where: { title: jobTitle },
        update: {},
        create: {
          title: jobTitle,
          created: "auto",
        },
      });

      const existingjobSkill = await prisma.jobSkill.findUnique({
        where: {
          jobId_skillId: {
            jobId: parseInt(jobId),
            skillId: parseInt(skillId),
          },
        },
      });

      if (!existingjobSkill) {
        await prisma.jobSkill.create({
          data: {
            jobId: parseInt(jobId),
            skillId: parseInt(skillId),
          },
        });
      }
    }
  }
};

// backup function to fill ext_jobs table with jobs that are in the file ./skillsWithJobs.js but not yet in the database;
const createAutoJobs = async () => {
  const uniqueJobs = [...new Set(skillsArray.flatMap((item) => item.jobs))];
  console.log(uniqueJobs);
  for (let job of uniqueJobs) {
    const existingJob = await prisma.jobs.findUnique({
      where: {
        title: job,
      },
    });
    if (!existingJob) {
      const newJob = await prisma.jobs.create({
        data: {
          title: job,
          created: "auto",
        },
      });
      console.log(newJob);
    }
  }
};

module.exports = {
  deleteConnection,
  getJobConnectionsWithSkill,
};
