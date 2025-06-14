import 'dotenv/config';

import { WakaQChildWorker } from 'wakaq';
import { wakaq } from '../index.js';

await new WakaQChildWorker(wakaq).start();
wakaq.disconnect();
process.exit(0);
