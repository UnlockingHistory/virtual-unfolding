#import "src/common/gpu/utils.cl"
#define EPSILON 0.00001f

static float linearInterpStrip(const float i, float strip[STRIP_LENGTH]) {
	// First check bounds.
	const int min_i = convert_int(floor(i));
	if (min_i < 0) {
		return strip[0];
	}
	const int max_i = convert_int(ceil(i));
	if (max_i >= STRIP_LENGTH) {
		return strip[STRIP_LENGTH - 1];
	}
	// Return linearly interpolated value.
    const float r = strip[min_i];
    const float l = strip[max_i];
    const float rlGain = i - floor(i);
    return (l * rlGain) + r * (1.0f - rlGain);
}

static float convolveStrip(const int i, const __global float *convolutionKernel, float strip[STRIP_LENGTH]) {
    float output = 0;
    for (int j = -KERNEL_DIM; j <= KERNEL_DIM; j++) {
        int stripIndex = i + j;
        if (stripIndex < 0) {
            stripIndex = 0;
        } else if (stripIndex >= STRIP_LENGTH) {
            stripIndex = STRIP_LENGTH - 1;
        }
        output += convolutionKernel[KERNEL_DIM + j] * strip[stripIndex];
    }
    return output;
}

static float2 calculateWidth(
	const float3 position,
	const float3 normal,
	__global __read_only float *data,
    __global __read_only float *firstDerivKernel,
	__global __read_only float *secondDerivKernel,
	__global __read_only int *size)
{
	// Init space to hold a strip of data.
	float strip[STRIP_LENGTH];
    // Extract oriented strip.
    for (int j = -STRIP_DIM; j <= STRIP_DIM; j++) {
        const float3 offsetPosition = position + normal * j;
        strip[j + STRIP_DIM] = trilinearInterpolation(offsetPosition, data, size);
    }

    // Check for nearest strip value under noise threshold around center point.
    // Linearly interp between points.
    volatile float posEdge = STRIP_DIM;
    volatile float negEdge = -STRIP_DIM;
    for (int j = 1; j <= STRIP_DIM; j++) {
        const int index = STRIP_DIM + j;
        const float firstDeriv = convolveStrip(index, firstDerivKernel, strip);
        if (firstDeriv <= 0 && strip[index] < NOISE_THRESHOLD) {
			if (strip[index - 1] < NOISE_THRESHOLD) {
				posEdge = j - 1.0f;
				break;
			}
            const float slope = strip[index - 1] - strip[index];
            if (fabs(slope) < EPSILON) {
                posEdge = j - 1.0f;
				break;
            }
			const float diff = strip[index - 1] - NOISE_THRESHOLD;
			posEdge = j - 1.0f + diff / slope;
            break;
        }
    }
    for (int j = 1; j <= STRIP_DIM; j++) {
        const int index = STRIP_DIM - j;
        const float firstDeriv = convolveStrip(index, firstDerivKernel, strip);
        if (firstDeriv >= 0 && strip[index] < NOISE_THRESHOLD) {
			if (strip[index + 1] < NOISE_THRESHOLD) {
				posEdge = -j + 1.0f;
				break;
			}
            const float slope = strip[index + 1] - strip[index];
            if (fabs(slope) < EPSILON) {
                negEdge = -j + 1.0f;
				break;
            }
			const float diff = strip[index + 1] - NOISE_THRESHOLD;
			negEdge = -j + 1.0f - diff / slope;
            break;
        }
    }

	// Check bounds. 
    if (posEdge >= STRIP_DIM) {
        posEdge = STRIP_DIM;
    }
    if (negEdge <= -STRIP_DIM) {
        negEdge = -STRIP_DIM;
    }

	// Use second derivative to move edges inward if possible.
    for (int j = 1; j <= floor(posEdge); j++){
        const int index = STRIP_DIM + j;
        const float secondDeriv = convolveStrip(index, secondDerivKernel, strip);
        if (secondDeriv >= RESPONSE_CUTOFF) {
            const float neighborSecondDeriv = convolveStrip(index - 1, secondDerivKernel, strip);
            const float slope = neighborSecondDeriv - secondDeriv;
            float newPosEdge;
            if (fabs(slope) < EPSILON) {
                newPosEdge = j - 1.0f;
            } else {    
                const float diff = neighborSecondDeriv - RESPONSE_CUTOFF;
                newPosEdge = j - 1.0f + diff / slope;
            }
            if (newPosEdge < posEdge) {
                posEdge = newPosEdge;
            }
            break;
        }
    }

    for (int j = 1; j <= floor(fabs(negEdge)); j++){
        const int index = STRIP_DIM - j;
        const float secondDeriv = convolveStrip(index, secondDerivKernel, strip);
        if (secondDeriv >= RESPONSE_CUTOFF) {
            const float neighborSecondDeriv = convolveStrip(index + 1, secondDerivKernel, strip);
            const float slope = neighborSecondDeriv - secondDeriv;
            float newNegEdge;
            if (fabs(slope) < EPSILON) {
                newNegEdge = - j + 1.0f;
            } else {
                const float diff = neighborSecondDeriv - RESPONSE_CUTOFF;
                newNegEdge = - j + 1.0f - diff / slope;
            }
            if (newNegEdge > negEdge) {
                negEdge = newNegEdge;
            }
            break;
        }
    }

	// Taper width off at constant slope.
	const float posEdgeVal = linearInterpStrip(STRIP_DIM + posEdge, strip);
	posEdge += posEdgeVal / TAPER_SLOPE;
	const float negEdgeVal = linearInterpStrip(STRIP_DIM + negEdge, strip);
	negEdge -= negEdgeVal / TAPER_SLOPE;

    // Check bounds. 
    if (posEdge >= STRIP_DIM) {
        posEdge = STRIP_DIM;
    }
    if (negEdge <= -STRIP_DIM) {
        negEdge = -STRIP_DIM;
    }

    const float2 output = {negEdge, posEdge};
    return output;
}

// static float2 adjustEdge(float edge, float3 point, float3 normal,
//     __global int *size, float ptMergeTol, float expectedSinglePageWidth,
//     int indicesCenterZ, int indicesWindowDim, __global float *points,
//     __global int *indices) {
//     float sign = 1.0f;
//     if (edge < 0) {
//         sign = -1.0f;
//     }
//     int3 lastVoxelChecked = calcIndex3DFromPosition3D(point);
//     // Find first pt along normal.
//     for (float t = 0.0f; t < fabs(edge); t += 0.1f) {
//         int3 voxelIndex = calcIndex3DFromPosition3D(point + normal * t * sign);
//         if (voxelIndex.x == lastVoxelChecked.x && voxelIndex.y == lastVoxelChecked.y && voxelIndex.z == lastVoxelChecked.z) {
//             continue;
//         }
//         if (!index3DInBounds(voxelIndex, size)) {
//             // Out of bounds.
//             break;
//         }
//         lastVoxelChecked = voxelIndex;

//         int neighbor_i = size[0] * size[1] * (voxelIndex.z - indicesCenterZ + indicesWindowDim) + size[0] * voxelIndex.y + voxelIndex.x;
//         // Check points z bounds.
//         if (neighbor_i < 0 || neighbor_i >= size[0] * size[1] * (2 * indicesWindowDim + 1)) {
//             continue;
//         }
//         int neighborIndex = indices[neighbor_i];
//         if (neighborIndex == NULL_INT32) {
//             // No neighbor here.
//             continue;
//         }
//         float3 neighborPos = {points[3 * neighborIndex + 1], points[3 * neighborIndex + 1], points[3 * neighborIndex + 2]};

//         // Project neighbor position onto normal vector and calc distance.
//         float3 neighborVec = neighborPos - point;
//         float dist = fabs(dot(normal, neighborVec));

//         // If neighbor is within merge tol, ignore.
//         if (dist <= ptMergeTol) {
//             continue;
//         }

//         // If neighbor is too close, set as bad (-1).
//         if (dist < expectedSinglePageWidth / 2) {
//             float2 output = {dist * sign, -1};
//             return output;
//         }

//         // If nearest neighbor is farther than current edge dist, ignore it (0).
//         if (dist > fabs(edge)) {
//             float2 output = {0, 0};
//             return output;
//         }

//         // Set edge to dist (1).
//         float2 output = {dist * sign, 1};
//         return output;
//     }
//     float2 output = {0, 0};
//     return output;
// }

__kernel void widthCalc(
	__global float *bounds,
    __global float *points,
	__global float *normals,
	__global float *data,
    __global int *size,
	__global float *firstDerivKernel,
	__global float *secondDerivKernel,
    __global int *indices,
	int indicesCenterZ
) {
    const size_t i =  get_global_id(0);
	const int i_global = i + INDICES_WINDOW_SIZE * size[0] * size[1];
    
    const int index1D = indices[i_global];
    if (index1D == NULL_INT32) {
        return;
    }

    const float3 normal = { normals[3 * index1D], normals[3 * index1D + 1], normals[3 * index1D + 2] };
    const float3 point = { points[3 * index1D], points[3 * index1D + 1], points[3 * index1D + 2] };

	// This indicates an error, we'll catch this in the main thread.
	if (point.x == NULL_FLOAT32 || normal.x == NULL_FLOAT32) {
		return;
	}

    // Calculate widths.
    const float2 widthInfo = calculateWidth(point, normal, data, firstDerivKernel, secondDerivKernel, size);
    const float negEdge = widthInfo.x;
    const float posEdge = widthInfo.y;

    // // Recalc width using mesh normals.
    // float3 meshNormal = { meshNormals[3 * index1D], meshNormals[3 * index1D + 1], meshNormals[3 * index1D + 2] };
    // widthInfo = calculateWidth(point, meshNormal, data, firstDerivKernel, secondDerivKernel,
    //     KERNEL_DIM, maximumExpectedWidth, NOISE_THRESHOLD, size);
    // if (widthInfo.y - widthInfo.x < width) {
    //     negEdge = widthInfo.x;
    //     posEdge = widthInfo.y;
    //     normal = meshNormal;
    //     normals[3 * index1D] = meshNormal.x;
    //     normals[3 * index1D + 1] = meshNormal.y;
    //     normals[3 * index1D + 2] = meshNormal.z;
    // }

    // // Check intersections of page width with neighboring pts.
    // float2 negEdgeAdjustment = adjustEdge(negEdge, point, normal,
    //     size, ptMergeTol, expectedSinglePageWidth, indicesCenterZ,
    //     indicesWindowDim, points, indices);
    // if (negEdgeAdjustment.y < 0) {
    //     // Mark as bad point.
    //     width = maximumExpectedWidth + EPSILON;
    //     negEdge = negEdgeAdjustment.x;
    // } else if (negEdgeAdjustment.y > 0) {
    //     negEdge = negEdgeAdjustment.x;
    //     width = posEdge - negEdge;
    // }
    // float2 posEdgeAdjustment = adjustEdge(posEdge, point, normal,
    //     size, ptMergeTol, expectedSinglePageWidth, indicesCenterZ,
    //     indicesWindowDim, points, indices);
    // if (posEdgeAdjustment.y < 0) {
    //     // Mark as bad point.
    //     width = maximumExpectedWidth + EPSILON;
    //     posEdge = posEdgeAdjustment.x;
    // } else if (posEdgeAdjustment.y > 0) {
    //     posEdge = posEdgeAdjustment.x;
    //     width = posEdge - negEdge;
    // }

    bounds[2 * i] = negEdge;
    bounds[2 * i + 1] = posEdge;
}