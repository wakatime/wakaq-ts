import 'dotenv/config';

import { WakaQWorker } from 'wakaq';
import { wakaq } from '../index.js';

const worker = new WakaQWorker(wakaq, ['node', '--no-warnings=ExperimentalWarning', '--import', 'tsx', 'src/scripts/wakaqChild.ts']);
await worker.start();
wakaq.disconnect();
process.exit(0);
