# chrome-extension-backend

## Summary

1. [Project structure](https://github.com/scaleupgroup/chrome-extension-backend#project-structure)
2. [Description of the API endpoint](https://github.com/scaleupgroup/chrome-extension-backend#description-of-the-api-endpoints)
3. [Database](https://github.com/scaleupgroup/chrome-extension-backend#database)
4. [Deployment](https://github.com/scaleupgroup/chrome-extension-backend#deployment)

---


## Project structure

Each file has comments that go into more detail about the code in it. This is just a general description of the purpose of the files.Each file has comments that go into more detail about the code in it. This is just a general description of the purpose of the files.

- **/database** - functions to perform CRUD operations in the database
  - **allSkillJob.js** - functions ( `deleteConnection()`, `createAutoJobs()`, `getJobConnectionsWithSkill()` ) to work with next database tables: **ext_job_skill** and **ext_jobs**.

  - **allSkills.js** - functions (`uploadSkills()`, `getAllSkills()`, `createNewSkill()`, `updateSkillById()`, `deleteSkillById()`, `getRegexForAllSkills()`) to work with next database tables: **ext_all_skills**, **ext_job_skill** and **dtb_candidate_skill**

  - **dailyQAStats.js** - functions (`getDailyQAStats()`, `createDailyQAStats()`, `increaseTotalReviewed()`) to work with next database tables: **ext_daily_qa_stats**

  - **dailyStats.js** - functions (`getDailyStats()`, `createDailyStats()`, `changeStats()`, `getSourcerStats()`) to work with next database tables: **ext_daily_stats** and **ext_sourced_stats**

  - **job.js** - functions (`getAllRules()`, `getAllJobs()`, `createJob()`, `updateJob()`, `deleteJob()`, `checkDeletedJobOwners()`, `arrayToRegex()`) to work with next database tables: **ext_jobs**, **ext_job_owners** and **ext_users**
  
  - **review.js** - functions (`createUpdateReview()`, `getAllReviews()`, `deleteReview()`, `mapDataToCandidate()`, `getSeniority()`) to work with next database tables: **ext_reviews** and **ext_candidates**

  - **users.js** - functions (`addNewUser()`, `updateUserById()`, `deleteUserById()`, `findAllUsers()`, `findAdminByEmail()`, `findUserByEmail()`, `checkUsers()`) to work with next database tables: **ext_users**

- **/prisma** - directory contains the Prisma schema file
    - **schema.prisma** - file acts as the main configuration point for the Prisma ORM, defining both the connection to your MySQL database and the structure of your database tables in terms of Prisma models. Each model in the schema corresponds to a table in your MySQL database, enabling object-relational mapping for efficient database operations.

- **/utils** - directory where the script file for connecting to the database is located
  - **prisma.js** - given code, depending on the environment (production or development), it initializes an instance of the Prisma Client differently. In production, it logs queries and various levels of potential errors. In a development environment, it checks whether a Prisma Client already exists before creating a new one, using the global object to ensure that only one instance of the Prisma Client exists during the application's lifecycle.

- **.env** - set next environment variables for application: `DATABASE_URL`

- **.gcloudignore** - specifies a list of files or directories that the Google Cloud SDK (gcloud) should not upload when deploying your application to Google Cloud App Engine

- **.gitignore** - specify which files and directories should be ignored by Git, meaning that they won't be tracked for version control

- **app.yaml** - file is a configuration file used for Google App Engine, specifies that the application should use the Node.js 16 runtime environment.

- **credentials.json** - file with JSON key for service acount to use GCP Google Shets API. New one can be created in GCP ("extension-360407" project) -> IAM and admin -> Service accounts -> extension-360407@appspot.gserviceaccount.com -> Actions -> Manage keys -> Add key -> Create new key -> Key type JSON -> Create

- **firebaseAccountKey.json** - file with key to connect firebase acount so we can verify tokens from frontend during authentication. New one can be created in Firebase ("extension-360407" project) -> Project settings -> Service accounts -> Firebase Admin SDK -> Generate new private key

- **index.js** - file serves as the entry point of your Express.js application, setting up the server, importing necessary modules, initializing middleware (including CORS and body parsing), and defining various API endpoints for tasks such as user authentication, data management for jobs, reviews, skills, and stats. It also initializes a Firebase instance for handling related operations (token verification). Finally, it starts the server on a specific port, defaulting to 8080 if none is provided in the environment variables.

- **package-lock.json** - this file holds various metadata relevant to the project.

- **package.json** - this is an automatically generated file that is created whenever a new module is installed in the project using npm. It locks down the versions of a project's dependencies so that you can control exactly which versions of each dependency will be used when anyone runs `npm install` on the project.

- **skillsWithJobs.js** - backup file that contains JSON with skills and related to them jobs. Now all this data in the **ext_all_skills** and **ext_jobs** tables. But if you need to fill the table data again and connect skills and jobs (**ext_job_skill** table), this file and next functions can be used for this: `uploadSkills()` - to fill **ext_all_skills table**; `createAutoJobs()` - to fill **ext_jobs** table with jobs that are in the file but not yet in the database; `connectJobsToSkills()` - to fill **ext_job_skill** table to create Many:Many database connection between skills and their corresponding jobs.

- **table.js** - script interacts with Google Sheets API to perform operations related to candidates data and also responsible to verifing sourcer, providing rules for scriping and couting statistics. It uses a JWT-based authentication method and has a few key components:
  - `authorize()`: Generates an authorized JWT client to interact with the Google Sheets API.
  - `getLinks(data)`: Exported method that initiates the findLinks function upon successful authorization.
  - `updateCandidate(candidate)`: Exported method that starts the findCandidate function after authorization.
  - `findLinks(JwtClient, data)`: Finds the 'back' and 'next' links for a specific candidate, considering several criteria, also collects data about user, stats, rules, and skills.
  - `findCandidate(JwtClient, candidate)`: Searches for specific candidate data in the Google Sheet and initiates the updateCandidate function if the candidate is found.
  - `updateCandidate(JwtClient, row, candidate)`: Updates the Google Sheets with specific candidate data.
  - `findRow(rows, data)`: Helper function to find the row that matches specific criteria from the data. It can find the row based on the candidate's name and URL.
  - `calcStats(stats)`: Helper function that calculates the total, relevant, and irrelevant stats from a given stats object.
- **table.js** - file include functions for authorizing the Google API, reading a set of candidate data from a Google Sheet (creating QA path), filtering and selecting a set of rows from this data, and updating the Google Sheet with new data (with reviewed by QA data): 
  - `authorize`: This asynchronous function creates and returns a new JWT client to authorize Google API requests using service acount email and private key from the credentials JSON file.
  - `getQAPath`: This asynchronous function accepts data as input and checks whether the user has admin privileges. If the user is an admin, it authorizes Google API, gets all rules and calls the getCandidates function.
  - `qaUpdate`: This asynchronous function also accepts data as input, authorizes Google API and calls the updateCandidate function to update a candidate's data with reviewed by QA data.
  - `getCandidates`: This function communicates with Google Sheets API to get a list of candidates from a specified range. It then filters rows based on certain criteria (relevant and job) and sends a response containing the chosen candidates.
  - `chooseRows`: This asynchronous function arranges rows of data based on owner and samples from these using reservoir sampling.
  - `reservoirSampling`: This function is used to perform reservoir sampling on an array. It's a random sampling algorithm to get the same amount of profiles from each part of the spreadsheet and from each sourcer.
  - `arraysToObjects`: This function transforms the arrays of candidate data into objects with key-value pairs for easier access and manipulation.
  - `updateCandidate`: This function updates the information of a specific candidate in the Google Sheet and stores it in the database if the review score from QA is bad.


___


## Description of the API endpoints

- **GET "/api"** - endpoint takes from the extension the name of the actual candidate (**name**), sourcer's initials (**owner**), link to the candidate's profile (**url**) and passes them to the **getLinks()** function, which finds relevant jobs (_rules_) for the sourcer, finds a link to the previous and next candidate in a Google Spreadsheet, creates or finds relevant statistics for the sourcer, and lists skills that are relevant to all jobs (**allSkills**). Endpoint returns the following object to the frontend: `{back, next, skills, rules, stats, alert}`. The `alert` attribute will only be set if no rules were found for the employee, so they cannot use the extension.

- **POST "/api"** - endpoint takes the following object from the frontend (extension): `{ owner, status, relevant, url, name, connections, experience, currentPosition, currentCompany, yearInCurrent, currentType, university, skills, allSkills, reachoutTopic, reachoutComment, sourcingJob}` and sends it to **updateCandidate()** function. This function fills the scraped data in the Google Spreadsheet and updates the statistics for the sourcer. This endpoint is used for writing or overwriting data from the extension to the Google Spreadsheet. The endpoint returns the following object: `{res, stats}`, the `res` attribute contains text with information about the name of the updated candidate and the row in the spreadsheet into which the data was written.

- **POST "/api/auth/firebase"** - endpoint is used by [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/login) to authenticate the user using Firebase. The function checks the validity of the token sent from the frontend and then checks if the user is in the database and has a role equal to admin using the `findAdminByEmail()` function.

- **GET "/api/jobs"** - endpoint is used by [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/login) to get list of all jobs (rules) using **getAllJobs()**. These jobs contain regexes and other data that are used to scrape and validate candidate information in the extension. Endpoint returns list of next objects to the frontend: `{ id, title, minConnections, universities, gradYear, experience, relevantRoles, skills, relevantDoc, stats, owners, created, allSkills }`.

- **POST "/api/job"** - enpoint takes the followind object of new job from the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/login): `{ title, owners, minConnections, universities, gradYear, experience, relevantRoles, skills, relevancyDoc }`. Then using `createJob()` function saves new job to the database and returns to the frontend object of new job from the database.

- **PUT "/api/job"** - enpoint takes the followind object of updated job from the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/login): `{ id, title, owners, minConnections, universities, gradYear, experience, relevantRoles, skills }`. Then using `updateJob()` function updates this job by id in the database and returns to the frontend object of updated job from the database.

- **DELETE "/api/job"** - endpoint takes from the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/login) id of the job to delete it in the database using `deleteJob()` function and returns object of deleted job to the frontend.

- **GET "/api/qa-path"** - endpoint from the QA extension gets the initials of the user who is doing the qa `QAOwner`; the total number of rows of candidates from Google Spreadsheet which the user wants to get on the QA `candidateNum`; a filter to select candidates by relevance `filterRelevant`, which can have the following values: _"relevant"_, _"unrelevant"_, _"both"_; and a filter to select candidates by profession `filterJob`. Then using `getQAPath()` function it checks if the user doing the QA has the "admin" role using `findAdminByAdmin()` function, then it finds the relevant rules (jobs) using `getAllRules("admin")` function and creates a candidate list which matches the filters (`filterRelevant`, `filterJob`) and the length limit (`candidateNum`). Endpoint will return a list of all `rules` and a list of candidates (`path`) for QA to the frontend.

- **POST "/api/qa-upadate"** - endpoint from the QA extension gets updated object of the candidate with score, current date and comment from the user who is doing QA (candidate). Here is structure of this object: `{qaOwner,qaComment,qaScore,qaDate,candidateIndex,candidateNewData: {}, candidateUnchangedData }`. Object sends to the `qaUpdate()` function that updates candidate's data in the Google Spreadsheet, creates "Review" in the database and updates stats for the user that is doing QA. Review in the database is further used in [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/login) where you can see on the "Reviews" page what has been changed by the user who did the QA, his comment for the sourcer and the score.

- **GET "/api/qa-stats"** - endpoint is used by "QA statistics" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/qa-statistics). Using `getDailyQAStats()` function it gets all QA stats for the last week and return to the frontend array of next objects: `{id, user, date, totalReviewed, userRelation: {}, candidates: [{}] }`.

- **GET "/api/reviews"** - endpoitn is used by "Reviews" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/reviews). Using `getAllReviews()` function it gets all Reviews created during QA process and returns to the frontend array of next objects:  `{ id, qaOwner, comment, score, date, User {}, Candidates []}`.

- **DELETE "/api/reviews"** - endpoint is used by "Reviews" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/reviews). It gets from frontend id of the review to delete and then using `deleteReview()` function and returns object of deleted review to the frontend.

- **GET "/api/stats"** - endpoint is used by "Statistics" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/statistics). Using `getDailyStats()` function it gets all sourcer's stats for the last week and return to the frontend array of next objects: `{id, user, date, totalSourced, userRelation: {}, candidates [{}], stats [{id, dailyStatsId, jobId, relevant, unrelevant, dailyStat, job, }] }`.

- **GET "/api/all-skills"** - endpoitn is used by "All Skills" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/all-skills). Using `getAllSkills()` function it gets all Reviews created during QA process and returns to the frontend array of next objects:  `{ id, qaOwner, comment, score, date, User {}, Candidates []}`.

- **POST "/api/all-skills"** - endpoitn is used by "All Skills" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/all-skills). It gets object of new skill and connected jobs to it from the frontend with next structure: `{ skill, connectedJobs: [] }`. Then using `createNewSkill()` function endpoint creates new skill in the database and in the table **ext_job_skill** connects new skill with related jobs. Endpoint returns array of all skills in the database from the function `getAllSkills()`.

- **PUT "/api/all-skills"** - endpoitn is used by "All Skills" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/all-skills). It gets object of updated skill and connected jobs to it from the frontend with next structure: `{ id, skill, connectedJobs: [] }`. Then using `updateSkillById()` function endpoint updates skill in the database and in the table **ext_job_skill** updates connections of the skill with related jobs. Endpoint returns array of all skills in the database from the function `getAllSkills()`.

- **DELETE "/api/all-skills"** - endpoitn is used by "All Skills" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/all-skills). It gets id of the skill to delete from the frontend. Then using `deleteSkillById()` function endpoint deletes all connection of this skill to related jobs in the table **ext_job_skill** and deletes skill from the database. Endpoint returns array of all skills in the database from the function `getAllSkills()`.

- **GET "/api/users"** - endpoitn is used by "Users" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/users). Using `findAllUsers()` function it gets all users of extensions (sourcer and QA) and relevancy web, and returns to the frontend array of next users' objects:  `{  id, email, role, stats, reviews, DailyQAStat }` orderd from newest to oldest.

- **POST "/api/users"** - endpoitn is used by "Users" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/users). It gets object of new user from the frontend with next structure: `{ email, role }`. Using `addNewUser()` function it adds new user to the database, and returns array of all users in the database from `findAllUsers()` function.

- **PUT "/api/users"** - endpoitn is used by "Users" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/users). It gets object of updated user from the frontend with next structure: `{ id, email, role }`. Using `updateUserById()` function it updates user in the database by id, and returns array of all users in the database from `findAllUsers()` function.

- **DELETE "/api/users"** - endpoitn is used by "Users" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/users). It gets id of the user to delete from the frontend and using `deleteUserById()` function endpoint deletes user from database. Endpoint returns array of all users in the database from `findAllUsers()` function.

- **GET "/api/skill-job"** - endpoitn is used by "Job form" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/home/form). The endpoint receives the job id from the frontend and uses `getJobConnectionsWithSkill()` function to return a list of skills to the frontend from a list of all relevant skills associated with a given job. The frontend receives an array of objects with next structure: `{jobId, skillId, job, skill: {id, name, jobs, candidates } }`.

- **DELETE "/api/skill-job"** - endpoitn is used by "Job form" page on the [relevancy.scaleup.wtf](http://relevancy.scaleup.wtf/home/form). The endpoint receives the job id and skill id from the frontend and uses `deleteConnection()` function to remove connection between given skill and job. The frontend receives an array of skills connected to given job with next structure: `{jobId, skillId, job, skill: {id, name, jobs, candidates } }`.

___


## Database
The database used is a MySQL database, which we work with using the Prisma ORM.

The database structure can be found in /prisma/schema.prisma. There is also a database schema in the [extension-database-scripts repository](https://github.com/scaleupgroup/extension-database-scripts) in the file **extension-sql.drawio**, which can be opened with the web application draw.io.

Database has events "clean_old_stats" and "clean_old_qa_data" code of which you can find in the in the [extension-database-scripts repository](https://github.com/scaleupgroup/extension-database-scripts) in the **cleanup-qa-ext-script.sql** and **cleanup-ext-stats-script.sql** files. First one every day removes sourcers' stats from the sourcing extension that are older then 7 days. Second one script every day removes QA stats and reviews that are older then 7 days.

**Note:** This project uses one table from the related DTB project (dtb_candidate_skill), which is a database of all sourced candidates with their relevant skills and relevant jobs. As [relevancy web](http://relevancy.scaleup.wtf/login) has a function to remove a skill from the database, this requires first removing all connections of this skill including those to sourced candidates.

___

## Deployment
Project runs on Google App Engine ("extension-360407" - project ID). 

Link to API in production: https://extension-360407.lm.r.appspot.com

Command for deploying project changes into production using the GCP CLI: `gcloud app deploy`

[The official guide on how to deploy a Node.js application on the Google Cloud](https://cloud.google.com/appengine/docs/standard/nodejs/building-app)

### GCP CLI Cheatsheet:
- Show all your projects: `gcloud projects list`
- Change current project: `gcloud config set project $MY_PROJECT_ID` 
- Deploy project / changes in the project: `gcloud app deploy`
- List all your acounts: `gcloud auth list`
- Change acount: `gcloud config set account ACCOUNT_ID`
- Add acount: `gcloud auth login`