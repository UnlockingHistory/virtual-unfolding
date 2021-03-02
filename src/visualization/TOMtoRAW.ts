// bvox 8 bit raw is a format used by blender to import volumetric data.
// http://pythology.blogspot.com/2014/08/you-can-do-cool-stuff-with-manual.html
// This script converts a tom file to bvox.

import { closeSync, openSync, writeSync } from 'fs';
import { Vector3 } from 'three';
import { BufferedTomDataR } from '../common/BufferedTomDataR';
import { getRuntimeParams } from '../common/utils';

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
const outputFile = openSync(`${OUTPUT_PATH}${FILENAME}.raw`, 'w');

const tempArrays: Uint8Array[] = [];
for (let i = 0; i < SCALE; i++) {
    tempArrays.push(new Uint8Array(DIMENSIONS.x * DIMENSIONS.y));
}

const buffer = Buffer.alloc(scaledDimensions.x * scaledDimensions.y);
for (let z = 0; z < scaledDimensions.z; z++) {
    for (let i = 0; i < SCALE; i++) {
        input.getLayer(SCALE * z + i, tempArrays[i]);
    }
    for (let y = 0; y < scaledDimensions.y; y++) {
        for (let x = 0; x < scaledDimensions.x; x++) {
            const index = SCALE * y * DIMENSIONS.x + SCALE * x;

            let sum = 0;
            for (let i = 0; i < SCALE; i++) {
                for (let j = 0; j < SCALE; j++) {
                    sum += tempArrays[i][index + j];
                }
            }

            buffer[y * scaledDimensions.x + x] = Math.round(sum / (SCALE * SCALE));
        }
    }

    writeSync(outputFile, buffer, 0, buffer.length, z * buffer.length);
}

console.log(`writing ${OUTPUT_PATH}${FILENAME}.raw`);
input.close();
closeSync(outputFile);