import { exampleTask } from '../index.js';

const main = async () => {
  try {
    await exampleTask.enqueue({ name: 'Jhon', age: 30 });
    process.exit(1);
  } catch (error) {
    console.error(error);
    process.exit(0);
  }
};

main();
