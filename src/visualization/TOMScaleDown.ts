// bvox 8 bit raw is a format used by blender to import volumetric data.
// http://pythology.blogspot.com/2014/08/you-can-do-cool-stuff-with-manual.html
// This script converts a tom file to bvox.

import { Vector3 } from 'three';
import { BufferedTomDataR } from '../common/BufferedTomDataR';
import { getRuntimeParams } from '../common/utils';
import { BufferedTomDataW } from '../common/BufferedTomDataW';

const params = getRuntimeParams();

let { FILENAME } = params;
const {
    OUTPUT_PATH,
    DATA_PATH,
    DIMENSIONS,
} = params;

const input = new BufferedTomDataR(DATA_PATH, FILENAME, 0);

const SCALE = process.env.SCALE ? parseInt(process.env.SCALE) : 1;
if (isNaN(SCALE) || SCALE < 1) {
    throw new Error(`Invalid SCALE param passed in: ${process.env.SCALE} must be a positive int.`);
}
console.log(`Scaling by factor: ${SCALE}.`);

const scaledDimensions = new Vector3();
scaledDimensions.x = Math.floor(DIMENSIONS.x / SCALE);
scaledDimensions.y = Math.floor(DIMENSIONS.y / SCALE);
scaledDimensions.z = Math.floor(DIMENSIONS.z / SCALE);

FILENAME += `_${scaledDimensions.x}x${scaledDimensions.y}x${scaledDimensions.z}`;
const output = new BufferedTomDataW(
	OUTPUT_PATH,
	FILENAME,
	'uint8',
	new Vector3(scaledDimensions.x, scaledDimensions.y, scaledDimensions.z),
	1,
	false,
);

const tempArrays: Uint8Array[] = [];
for (let i = 0; i < SCALE; i++) {
    tempArrays.push(new Uint8Array(DIMENSIONS.x * DIMENSIONS.y));
}

const buffer = Buffer.alloc(scaledDimensions.x * scaledDimensions.y);
for (let z = 0; z < scaledDimensions.z; z++) {
	const outputLayer = output.getData();

    for (let i = 0; i < SCALE; i++) {
        input.getLayer(SCALE * z + i, tempArrays[i]);
    }
    for (let y = 0; y < scaledDimensions.y; y++) {
        for (let x = 0; x < scaledDimensions.x; x++) {
			const x0 = SCALE * x;
			const y0 = SCALE * y;

            let sum = 0;
            for (let i = 0; i < SCALE; i++) {
                for (let j = 0; j < SCALE; j++) {
					for (let k = 0; k < SCALE; k++) {
                 		sum += tempArrays[k][(y0 + j) * DIMENSIONS.x + x0 + i];
					}
                }
            }

            outputLayer[y * scaledDimensions.x + x] = Math.round(sum / (SCALE * SCALE * SCALE));
        }
    }

	output.writeLayer(z);
}

console.log(`writing ${OUTPUT_PATH}${FILENAME}.tom`);
input.close();
output.close();
