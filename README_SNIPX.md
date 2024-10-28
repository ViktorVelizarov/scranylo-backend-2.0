## Project structure

**/database** - functions to perform CRUD operations in the database

**/prisma** - directory contains the Prisma schema file

**/utils** - directory where the script file for connecting to the database is located

**.env** - set next environment variables for application: `DATABASE_URL`

**.gcloudignore** - specifies a list of files or directories that the Google Cloud SDK (gcloud) should not upload when deploying your application to Google Cloud App Engine

**.gitignore** - specify which files and directories should be ignored by Git, meaning that they won't be tracked for version control

**app.yaml** - file is a configuration file used for Google App Engine, specifies that the application should use the Node.js 16 runtime environment.

**index.js** - file serves as the entry point of your Express.js application, setting up the server, importing necessary modules, initializing middleware (including CORS and body parsing), and defining various API endpoints for tasks. Most logic for the endpoints is moved to different files and improted as a function in index.js. But there are still some logic held in index.js for some endpoint becouse they requre a given module that is imported there. It also initializes a Firebase instance for handling related operations (token verification). Finally, it starts the server on a specific port, defaulting to 8080 if none is provided in the environment variables.

**package-lock.json** - this file holds various metadata relevant to the project.

**package.json** - this is an automatically generated file that is created whenever a new module is installed in the project using npm. It locks down the versions of a project's dependencies so that you can control exactly which versions of each dependency will be used when anyone runs `npm install` on the project.


___

## Database
The database used is a MySQL database, which we work with using the Prisma ORM. Keep in mind that the same database is used for the SCRANYLO extension project so some of the tables are from there. Also there is an online database console which you can use for CRUD operations, link and password can be found in .env file

The database structure can be found in /prisma/schema.prisma.
A diagram of the structure can be found in /prisma/prisma_schema_diagram.png

A second firebase DB is also used only for user authentication. I used libraries to connect to it both on frontend and backend. The main point of contact with it in the backend is the endpoint /api/snipx_auth/firebase is called after a user logs in with an email address on the frontend. That endpoint basically jsut checks if the email the user logged in with is present in the main MySQL database in snipx_users table and if its not, then the user is not given permission to the app. That way only users that log in with an email address that is already present in the MySQL database can access the app.
__

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

__

### IMPORTANT: 
Make sure to NEVER commit the .env file and the credentials json files to the repository