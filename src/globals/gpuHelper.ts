import { DEVICE_NUM } from '../common/Defaults';
import GPUHelper from '../common/GPUHelper';

// Init gpuHelper singleton.
export const gpuHelper = new GPUHelper(process.env.DEVICE_NUM ? parseInt(process.env.DEVICE_NUM) : DEVICE_NUM);