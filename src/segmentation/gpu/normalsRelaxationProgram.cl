#import "src/common/gpu/utils.cl"

static float3 getWeightedEigenForIndex(
	const int3 index3D,
	const float3 referenceVector,
	__global __read_only int *size,
	__global __read_only float *normals,
    __global __read_only float *responses
) {
    // Zero at boundary.
    if (!index3DInBounds(index3D, size)) {
        const float3 zero = 0;
        return zero;
    }
    const int i = calcIndex1DFromIndex3D(index3D, size);
    // Use magnitude of eignvalue as weight - this increases coherence of relaxation
    // by taking advantage of the fact that regions between paper layers tend to form distinct
    // dark 'layers' that tend to be oriented in same direction as paper.
    const float eigenValue = fabs(responses[i]);
    float3 eigenVec = { normals[3 * i], normals[3 * i + 1], normals[3 * i + 2] };
    // Reorient neighbor eignvec if needed.
    if (dot(eigenVec, referenceVector) < 0) {
        eigenVec *= -1.0f;
    }
    return eigenVec * eigenValue;
}

__kernel void normalsRelaxation(
	__global __read_only float *normals,
	__global __read_only float *responses,
    __global __read_only float *rxx,
	__global __read_only float *ryy,
	__global __read_only float *rzz,
    __global __read_only float *rxy,
	__global __read_only float *ryz,
	__global __read_only float *rxz,
    __global __write_only float *nextNormals,
	__global __write_only float *nextResponses,
	__global __read_only int *size)
{
    const size_t i =  get_global_id(0);
	const int i_global = i + WINDOW_SIZE * size[0] * size[1];
    const int3 index3D = calcIndex3DFromIndex1D(i_global, size);

	// Calc weighted normal.
	const float3 referenceVector = { normals[3 * i_global], normals[3 * i_global + 1], normals[3 * i_global + 2] };
    float3 avg = getWeightedEigenForIndex(index3D, referenceVector, size, normals, responses);
    // Iter over six neighbors.
    const int3 neighbors[] = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
    for (int j = 0; j < 6; j++) {
        const int3 neighborIndex3D = neighbors[j] + index3D;
        avg += getWeightedEigenForIndex(neighborIndex3D, referenceVector, size, normals, responses);
    }
    avg = normalize(avg);

    // Calc a new response for the avg orientation.
    const float _rxx = rxx[i];
    const float _ryy = ryy[i];
    const float _rzz = rzz[i];
    const float _rxy = rxy[i];
    const float _ryz = ryz[i];
    const float _rxz = rxz[i];
    const float lambda =
		_rxx * avg.x * avg.x +
		_ryy * avg.y * avg.y +
		_rzz * avg.z * avg.z
        + 2.0f *
			(_rxy * avg.x * avg.y +
			_ryz * avg.y * avg.z +
			_rxz * avg.x * avg.z );

    // Store next vals.
    nextNormals[3 * i] = avg.x;
    nextNormals[3 * i + 1] = avg.y;
    nextNormals[3 * i  + 2] = avg.z;
    nextResponses[i] = lambda;
}