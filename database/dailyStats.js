const prisma = require("../utils/prisma");

// Get all stats for /statistics page in the relevancy web with related data for this stats as data about sourcers, jobs, linkes to reviewed candidates
const getDailyStats = async () => {
  return await prisma.dailyStat.findMany({
    include: {
      userRelation: true,
      candidates: true,
      stats: {
        include: {
          job: true,
        },
      },
    },
  });
};

// create new empty stats object for today for given user
const createDailyStats = async (userId) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const newDailyStats = await prisma.dailyStat.create({
    data: {
      user: userId,
      date: today,
      totalSourced: 0,
    },
  });
  return newDailyStats;
};

// update stats if needed for a given user
const changeStats = async (userId, job, relevant, url, oldData) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Find the daily stats for the user for today
  let dailyStats = await prisma.dailyStat.findFirst({
    where: {
      user: parseInt(userId),
      date: today,
    },
    include: {
      candidates: true, // Include sourced candidates in the result (their links to aviod counting stats for the same candidate duirng upload)
      stats: {
        include: {
          job: true, //include data about the jobs
        },
      },
    },
  });
  // If there are daily stats for today
  if (dailyStats) {
    // Get all sourced candidates' URLs
    const sourcedCandidatesURLs = dailyStats.candidates.map(
      (candidate) => candidate.candidateURL
    );
    // If the candidate has not been sourced before by this user 
    if (!sourcedCandidatesURLs.includes(url)) {
      dailyStats.totalSourced += 1;
      // Check if sourcer has already some stats for this job
      let jobStat = dailyStats.stats.find((stat) => stat.job.title === job);
      // If it is first candidate for this job today
      if (!jobStat) {
        const jobData = await prisma.jobs.findFirst({ where: { title: job } });
        // Create a new job stat if it doesn't exist
        jobStat = await prisma.sourcedStats.create({
          data: {
            jobId: parseInt(jobData.id),
            relevant: relevant.toLowerCase() === "yes" ? 1 : 0,
            unrelevant: relevant.toLowerCase() === "no" ? 1 : 0,
            dailyStatsId: parseInt(dailyStats.id),
          },
        });
        dailyStats.stats.push(jobStat);
      } else {
        // If there are stats for the job, increment relevant or unrelevant count
        if (relevant.toLowerCase() === "yes") {
          jobStat.relevant += 1;
        } else {
          jobStat.unrelevant += 1;
        }
        // Update job stats
        jobStat = await prisma.sourcedStats.update({
          where: {
            id: parseInt(jobStat.id),
          },
          data: {
            relevant: jobStat.relevant,
            unrelevant: jobStat.unrelevant,
          },
        });
      }
      // Save changes in daily stats
      dailyStats = await prisma.dailyStat.update({
        where: { id: parseInt(dailyStats.id) },
        data: {
          totalSourced: dailyStats.totalSourced,
          candidates: {
            create: { candidateURL: url },
          },
        },
        include: {
          candidates: true,
          stats: {
            include: {
              job: true,
            },
          },
        },
      });
    } else {
      // now user updating data for already sourced candidate for example and relevance status has changed
      if (relevant.toLowerCase() !== oldData[4].toLowerCase()) {
        // Find stats for the job
        let jobStat = dailyStats.stats.find((stat) => stat.job.title === job);
        // Increment relevant/unrelevant count based on the new relevant status
        if (relevant.toLowerCase() === "yes") {
          jobStat.relevant += 1;
          if (jobStat.unrelevant > 0) {
            jobStat.unrelevant -= 1;
          }
        } else {
          jobStat.unrelevant += 1;
          if (jobStat.relevant > 0) {
            jobStat.relevant -= 1;
          }
        }
        // Update job stats
        await prisma.sourcedStats.update({
          where: { id: parseInt(jobStat.id) },
          data: {
            relevant: jobStat.relevant,
            unrelevant: jobStat.unrelevant,
          },
        });
      }
    }
    return dailyStats;
  } else {
    // If there are no daily stats for today, create new daily stats with given job and return new stats
    const jobData = prisma.jobs.findFirst({ where: { title: job } });
    const newDailyStats = await prisma.dailyStat.create({
      data: {
        user: parseInt(userId),
        date: today,
        totalSourced: 1,
        candidates: {
          create: [
            {
              candidateURL: url,
            },
          ],
        },
        stats: {
          create: [
            {
              jobId: parseInt(jobData.id),
              relevant: relevant.toLowerCase() === "yes" ? 1 : 0,
              unrelevant: relevant.toLowerCase() === "no" ? 1 : 0,
            },
          ],
        },
      },
      include: {
        candidates: true,
        stats: {
          include: {
            job: true,
          },
        },
      },
    });
    return newDailyStats;
  }
};

// retrieves the daily stats of a given user, if no stats are found for the day, function creates a new stats entry.
const getSourcerStats = async (userId) => {
  // Set current date, ignoring the time.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Fetch the existing daily stats for the user on the current date with related data as data about jobs, and links of reviewed candidates
  const existingDailyStats = await prisma.dailyStat.findFirst({
    where: { user: userId, date: today },
    include: {
      candidates: true,
      stats: {
        include: {
          job: true,
        },
      },
    },
  });
  // If no existing daily stats are found, create new daily stats for the user.
  if (!existingDailyStats) {
    return await createDailyStats(userId);
  } else {
    return existingDailyStats;
  }
};

module.exports = {
  createDailyStats,
  changeStats,
  getSourcerStats,
  getDailyStats,
};
