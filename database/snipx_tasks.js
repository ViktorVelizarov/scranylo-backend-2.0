const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { tasksClient } = require('./cloud_tasks'); // Assuming your Cloud Tasks client setup is here

// Get all tasks for a specific company, including whether users and skills are assigned
async function getTasksForCompany(req, res) {
  const { companyID } = req.params;

  try {
    const tasks = await prisma.snipxTask.findMany({
      where: { company_id: parseInt(companyID) },
      select: {
        id: true,
        task_name: true,
        task_description: true,
        task_type: true,
        created_at: true,
        assignedUsers: {
          select: { user_id: true }
        },
        taskSkills: {
          select: { skill_id: true }
        },
      },
    });

    const tasksWithAssignments = tasks.map(task => ({
      ...task,
      hasUsersAssigned: task.assignedUsers.length > 0,
      hasSkillsAssigned: task.taskSkills.length > 0,
    }));

    res.status(200).json(tasksWithAssignments).end();
  } catch (error) {
    console.error('Error fetching tasks for company:', error);
    res.status(500).json({ error: 'Failed to fetch tasks for company.' }).end();
  }
}

// Assign skills to a task
async function assignSkillsToTask(req, res) {
  const { taskId } = req.params;
  let { skill_ids, score } = req.body;

  score = Number(score);

  if (!Array.isArray(skill_ids) || skill_ids.length === 0 || isNaN(score)) {
    return res.status(400).json({ error: 'Invalid input data.' });
  }

  try {
    const assignments = await Promise.all(
      skill_ids.map(skill_id =>
        prisma.snipxTaskSkill.create({
          data: {
            task: { connect: { id: parseInt(taskId) } },
            skill: { connect: { id: parseInt(skill_id) } },
            score: score,
          },
        })
      )
    );

    res.status(201).json({ message: 'Skills assigned to task successfully!', assignments });
  } catch (error) {
    console.error('Error assigning skills to task:', error);
    res.status(500).json({ error: 'Failed to assign skills to task.' });
  }
}

// Create a new task
async function createTask(req, res) {
  const { task_name, task_description, task_type, company_id, endsAt } = req.body;

  if (!task_name || !company_id) {
    return res.status(400).json({ error: 'Task name and company ID are required.' }).end();
  }

  try {
    const endsAtDate = new Date(endsAt);
    if (isNaN(endsAtDate)) {
      return res.status(400).json({ error: 'Invalid endsAt date.' }).end();
    }

    const totalHours = (endsAtDate - new Date()) / (1000 * 60 * 60);

    const newTask = await prisma.snipxTask.create({
      data: {
        task_name,
        task_description: task_description || null,
        task_type: task_type || null,
        company_id: parseInt(company_id),
        ends_at: endsAtDate,
        total_hours: totalHours,
      },
    });

    const project = 'extension-360407';
    const queue = 'queue1';
    const location = 'europe-central2';
    const url = 'https://extension-360407.lm.r.appspot.com/api/task/execute';
    const payload = JSON.stringify({ taskId: newTask.id });

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(payload).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor((endsAtDate.getTime() - 2 * 60 * 60 * 1000) / 1000),
      },
    };

    const parent = tasksClient.queuePath(project, location, queue);
    await tasksClient.createTask({ parent, task });

    res.status(201).json(newTask).end();
  } catch (error) {
    console.error('Error creating new task:', error);
    res.status(500).json({ error: 'Failed to create new task.' }).end();
  }
}

// Delete a task by ID
async function deleteTask(req, res) {
  const { id } = req.params;

  try {
    const taskExists = await prisma.snipxTask.findUnique({ where: { id: parseInt(id) } });

    if (!taskExists) {
      return res.status(404).json({ error: 'Task not found.' }).end();
    }

    await prisma.snipxTask.delete({ where: { id: parseInt(id) } });
    res.status(200).json({ message: 'Task deleted successfully.' }).end();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task.' }).end();
  }
}

// Assign multiple users to a task
async function assignUsersToTask(req, res) {
  const { task_id, user_ids } = req.body;

  if (!task_id || !Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'Task ID and an array of user IDs are required.' }).end();
  }

  try {
    const createTaskUserRelations = user_ids.map(userId =>
      prisma.snipxTaskUser.create({
        data: {
          task_id: parseInt(task_id),
          user_id: parseInt(userId),
        },
      })
    );

    await Promise.all(createTaskUserRelations);
    res.status(200).json({ message: 'Users successfully assigned to the task.' }).end();
  } catch (error) {
    console.error('Error assigning users to task:', error);
    res.status(500).json({ error: 'Failed to assign users to task.' }).end();
  }
}

// Execute a task (triggered by Cloud Tasks)
async function executeTask(req, res) {
  const { taskId } = req.body;

  try {
    const task = await prisma.snipxTask.findUnique({ where: { id: taskId }, select: { total_hours: true } });
    if (!task) {
      return res.status(404).send('Task not found.');
    }

    const { total_hours } = task;
    const assignedUsers = await prisma.snipxTaskUser.findMany({ where: { task_id: taskId }, select: { user_id: true } });
    const taskSkills = await prisma.snipxTaskSkill.findMany({ where: { task_id: taskId }, select: { skill_id: true } });

    if (assignedUsers.length === 0 || taskSkills.length === 0) {
      return res.status(200).send('No users or skills linked to this task.');
    }

    for (const userAssignment of assignedUsers) {
      for (const skillAssignment of taskSkills) {
        const existingRecord = await prisma.snipxUserSkillHours.findUnique({
          where: { user_id_skill_id: { user_id: userAssignment.user_id, skill_id: skillAssignment.skill_id } }
        });

        let newHours;
        if (existingRecord) {
          newHours = existingRecord.hours + Math.floor(total_hours);
          await prisma.snipxUserSkillHours.update({
            where: { user_id_skill_id: { user_id: userAssignment.user_id, skill_id: skillAssignment.skill_id } },
            data: { hours: newHours },
          });
        } else {
          newHours = Math.floor(total_hours);
          await prisma.snipxUserSkillHours.create({
            data: { user_id: userAssignment.user_id, skill_id: skillAssignment.skill_id, hours: newHours }
          });
        }

        const thresholds = [10, 50, 100];
        for (const threshold of thresholds) {
          if (newHours >= threshold) {
            const existingNotification = await prisma.snipxNotifications.findFirst({
              where: { user_id: userAssignment.user_id, skill_id: skillAssignment.skill_id }
            });

            if (!existingNotification) {
              await prisma.snipxNotifications.create({
                data: { user_id: userAssignment.user_id, skill_id: skillAssignment.skill_id, approved: false }
              });
              break;
            }
          }
        }
      }
    }

    res.status(200).send('Task executed successfully.');
  } catch (error) {
    console.error(`Error executing task with ID: ${taskId}`, error);
    res.status(500).send('Internal Server Error.');
  }
}

module.exports = {
  getTasksForCompany,
  assignSkillsToTask,
  createTask,
  deleteTask,
  assignUsersToTask,
  executeTask,
};
