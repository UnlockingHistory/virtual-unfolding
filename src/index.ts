import segmentation from './segmentation';
import flattening from './flattening';
import texturing from './texturing';
import GPUHelper from './common/GPUHelper';
import { DEVICE_NUM, segmentationParams, texturingParams, flatteningParams, ANIMATION_PATH, SHOULD_SAVE_ANIMATION } from './common/Defaults';
import { stringifyVector3, getRuntimeParams } from './common/utils';
// import invert from './visualization/invertCreasePattern';

// Print current date and time.
console.log('Start time:', new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''));
// Print current git commit.
try {
	const stdout = require('child_process').execSync('git rev-parse HEAD');
	console.log('Last commit hash on this branch is:', stdout.toString());
} catch (error) {
	console.log('Unable to retrieve last git commit.');
}

// Process command line arguments.
console.log(`ENV variables: { ${Object.keys(process.env).filter(key => !key.includes('npm_')).map(key => `${key}: ${process.env[key]}`).join(', ')} }\n`);
const fileParams = {
	...getRuntimeParams(),
	ANIMATION_PATH: ANIMATION_PATH,
	SHOULD_SAVE_ANIMATION: SHOULD_SAVE_ANIMATION,
};

// Print out parameters used.
console.log(JSON.stringify({
	segmentationParams,
	flatteningParams,
}, null, 2))

segmentation(fileParams, segmentationParams);
// flattening(fileParams, flatteningParams);
// texturing(fileParams, texturingParams);

console.log("finished");

// invert()