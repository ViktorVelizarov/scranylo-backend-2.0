const prisma = require("../utils/prisma");

// Create or update (in case if review for this users and sourcer was already created) review from QA
const createUpdateReview = async (data) => {
  console.log(data);
  // Check if QA owner exists
  const ownerEmail = `${data.qaOwner.toLowerCase()}@scaleup.agency`;
  const user = await prisma.users.findFirst({ where: { email: ownerEmail } });
  if (!user) {
    throw new Error(`User with email: ${ownerEmail} does not exist`);
  }
  // Check if review for this candidate was alreade created
  const existingReview = await prisma.reviews.findFirst({
    where: {
      AND: [
        { date: data.date },
        { Candidates: { some: { LIprofileNew: data.newData.url } } },
      ],
    },
    include: {
      Candidates: true,
    },
  });
  // Depending on the previous search, update or create new review. in both cases unify old and new data to one format for database
  if (!existingReview) {
    console.log("Creating new review...");
    const newReview = await prisma.reviews.create({
      data: {
        qaOwner: parseInt(user.id),
        comment: data.comment,
        score: data.score,
        date: data.date,
        Candidates: {
          create: [
            { ...mapDataToCandidate(data.oldData, {}) },
            { ...mapDataToCandidate(data.newData, data.oldData) },
          ],
        },
      },
    });

    return newReview;
  } else {
    const updatedReview = await prisma.reviews.update({
      where: {id: existingReview.id},
      data: {
        qaOwner: parseInt(user.id),
        comment: data.comment,
        score: data.score,
        date: data.date,
        Candidates: {
          update: [
            {
              where: {id: existingReview.Candidates[0].id},
              data: {...mapDataToCandidate(data.oldData, {})},
            },
            {
              where: {id: existingReview.Candidates[1].id},
              data: {...mapDataToCandidate(data.newData, data.oldData)},
            }
          ]
        }
      }
    });
    return updatedReview;
  }
};

// Get all reviews in the database for relevancy web /reviews page
const getAllReviews = async () => {
  const allReviews = await prisma.reviews.findMany({
    include: {
      User: true,
      Candidates: true,
    }
  });
  return allReviews;
};

const deleteReview = async (reviewId) => {
  // Delete associated candidates' data
  await prisma.candidates.deleteMany({
    where: {reviewId: parseInt(reviewId)},
  });

  // Delete the review itself
  await prisma.reviews.delete({
    where: {id: parseInt(reviewId)},
  });

  // Return remaining reviews
  await prisma.reviews.findMany({
    include: {
      User: true,
      Candidates: true,
    },
  });
};

module.exports = {
  createUpdateReview,
  getAllReviews,
  deleteReview,
};

// Maps given data to the candidate's model and unify them, while prioritizing new data over old data.
const mapDataToCandidate = (data, old) => {
  return {
    dataType: old.index ? "new" : "old",
    rowNum: old.index ? old.index : data.index,
    name: data.name,
    owner: data.owner,
    status: data.status,
    transfered: old.transfered ? old.transfered : data.transfered,
    relevant: data.relevant,
    LIprofileOld: old.LIprofileOld ? old.LIprofileOld : data.LIprofileOld,
    LIprofileNew: old.LIprofileNew ? old.LIprofileNew : data.LIprofileNew,
    connections: data.connections,
    currentRole: data.currentRole ? data.currentRole : data.currentPosition,
    country: old.country ? old.country : data.country,
    university: data.university,
    yearOfGrad: data.yearOfGrad ? data.yearOfGrad : data.gradYear,
    currentCompany: data.currentCompany,
    yrsInCurrentComp: data.yrsInCurrentComp
      ? data.yrsInCurrentComp
      : data.yearInCurrent,
    totalExp: data.totalExp ? data.totalExp : data.experience,
    seniority: data.totalExp
      ? getSeniority(data.totalExp)
      : getSeniority(data.experience),
    jobType: data.jobType ? data.jobType : data.currentType,
    skills: typeof data.skills !== "string" ? data.skills.join(", ") : data.skills,
    reachoutTopic: data.reachoutTopic,
    reachoutComment: data.reachoutComment,
    qaScore: old.qaScore ? old.qaScore : data.qaScore,
    qaComment: old.qaComment ? old.qaComment : data.qaComment,
  };
}


const getSeniority = (experience) => {
  if(parseFloat(experience) < 2){
    return "Junior";
  }else if(parseFloat(experience) < 5){
    return "Medior";
  }else{
    return "Senior"
  }
} 