const { checkUsers } = require("./user");
const prisma = require("../utils/prisma");

// This function is used to get all job rules (jobs) owned by a specific user or if user is an admin, then get all rules. Function used by sourcing extension
const getAllRules = async (ownerName, role) => {
  console.log("ownerName:")
  console.log(ownerName)
  console.log("role:")
  console.log(role)
  // Fetch all jobs
  const jobs = await getAllJobs();
  console.log("all jobs:")
  console.log(jobs)
  const updatedJobs = [];
  for (let i in jobs) {
    // Check if user was added to the job or if the user is admin
    if (jobs[i].owners.includes(ownerName) || role === "admin") {
      let updatedJob = {};
      updatedJob = { ...jobs[i] };
      // convert array of values to the regexes for scraping in the extension
      updatedJob["universitiesRegex"] = arrayToRegex(
        jobs[i].universities,
        false
      );
      updatedJob["relevantRolesRegex"] = arrayToRegex(
        jobs[i].relevantRoles,
        false
      );
      updatedJob["skillsRegex"] = arrayToRegex(jobs[i].skills, true);
      updatedJobs.push(updatedJob);
    }
  }
  return updatedJobs;
};

// Get all jobs for relevancy web and conver string to arrays of values so user can edit this values one by one, as universities, skills etc
const getAllJobs = async () => {
  const jobs = await prisma.jobs.findMany({
    include: {
      allSkills: {
        include: {
          skill: true,
        },
      },
      owners: true,
    },
  });
  const formattedJobs = jobs.map((job) => ({
    ...job,
    owners: job.owners.map((owner) => owner.owner),
    universities: JSON.parse(job.universities),
    relevantRoles: JSON.parse(job.relevantRoles),
    skills: JSON.parse(job.skills),
  }));
  return formattedJobs;
};

// Create new job in relevancy web
const createJob = async (data) => {
  // remove possible duplicates from array of owners
  const owners = [...new Set(data.owners)];
  // check if that users extist, if not, then create them
  await checkUsers(owners);
  const newJobData = await prisma.$transaction(async (prisma) => {
    const newJob = await prisma.jobs.create({
      data: {
        title: data.title,
        minConnections: data.minConnections ? parseInt(data.minConnections) : 0,
        universities: JSON.stringify(data.universities),
        gradYear: data.gradYear,
        experience: data.experience,
        relevantRoles: JSON.stringify(data.relevantRoles),
        skills: JSON.stringify(data.skills),
        relevantDoc: data.relevantDoc,
        created: "manual",
      },
    });
    // add connection betweeb job and users
    // later it would be nice to connect ext_jobs and ext_users tables so ext_job_owners table would have two columns with user's ID and job's ID without duplicating data from the ext_users
    const owners = data.owners.map((owner) => {
      return prisma.jobOwners.create({
        data: {
          jobId: newJob.id,
          owner: owner,
        },
      });
    });

    let newOwnersData = await Promise.all(owners);
    newJob[owners] = newOwnersData;
    return newJob;
  });
  return newJobData;
};

// Update existing Job from the relevancy web
const updateJob = async (data) => {
  // remove possible duplicates from array of owners
  const owners = [...new Set(data.owners)];
  // check if that users extist, if not, then create them
  await checkUsers(owners);

  const updatedJobData = await prisma.$transaction(async (prisma) => {
    // update jobs data
    const updatedJob = await prisma.jobs.update({
      where: { id: data.id },
      data: {
        title: data.title,
        minConnections: data.minConnections ?  parseInt(data.minConnections) : 0,
        universities: JSON.stringify(data.universities),
        gradYear: data.gradYear,
        experience: data.experience,
        relevantRoles: JSON.stringify(data.relevantRoles),
        skills: JSON.stringify(data.skills),
        relevantDoc: data.relevantDoc,
      },
      include: {
        allSkills: true,
      }
    });
    // delete all job owners
    await prisma.jobOwners.deleteMany({
      where: { jobId: data.id },
    });
    // create new job owners
    const owners = data.owners.map((owner) => {
      return prisma.jobOwners.create({
        data: {
          jobId: updatedJob.id,
          owner: owner,
        },
      });
    });

    let updatedOwnersData = await Promise.all(owners);
    updatedJob[owners] = updatedOwnersData;
    return updatedJob;
  });
  return updatedJobData;
};

// Delete selected job from relevancy web
const deleteJob = async (jobId) => {
  // save all users added to given job, so they later can be checked in checkDeletedJobOwners()
  const jobOwners = await prisma.jobOwners.findMany({
    where: { jobId: parseInt(jobId) },
  });
  // delete job and connecting with users
  const deletedJob = await prisma.$transaction(async (prisma) => {
    await prisma.jobOwners.deleteMany({
      where: { jobId: parseInt(jobId) },
    });
    const deletedJob = await prisma.jobs.delete({
      where: { id: parseInt(jobId) },
    });

    return deletedJob;
  });
  await checkDeletedJobOwners(jobOwners);
  return deletedJob;
};

// Check if user deleted from the job is added to some other jobs, if user has now job, then delet it from the database of users
const checkDeletedJobOwners = async (jobOwners) => {
  for (let i = 0; i < jobOwners.length; i++) {
    let owner = jobOwners[i].owner;
    console.log("checked owner");
    const relatedJobs = await prisma.jobOwners.findMany({
      where: { owner: owner },
    });
    if (relatedJobs.length === 0) {
      let email = owner.toLowerCase() + "@scaleup.agency";
      console.log("email on delete:");
      console.log(email);
      await prisma.users.deleteMany({
        where: { email: email, role: {
          not: "admin"
        } },
      });
    }
  }
};

// This function is used to convert an array of strings to a regex pattern
const arrayToRegex = (array, metaEscape) => {
  if(!array){
    return [];
  }
  const regex = array.map((element) => {
      element = element.trim();
      element = element.replace(/\s+/gm, "\\s+"); // Replace one or more whitespace characters with "\s+"
      if (metaEscape) {
        element = `(\\W${element}\\W)`;
      } else {
        element = `(${element})`;
      }
      return element;
    })
    .join("|");
  return regex;
};

module.exports = {
  getAllRules,
  getAllJobs,
  createJob,
  updateJob,
  deleteJob,
};
