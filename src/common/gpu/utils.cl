static bool index3DInBounds(const int3 index3D, __global __read_only int *size) {
	if (index3D.x < 0 || index3D.x >= size[0] ||
		index3D.y < 0 || index3D.y >= size[1] ||
		index3D.z < 0 || index3D.z >= size[2]) {
        return false;
    }
	return true;
}

static bool index2DInBounds(const int2 index, const int sizeX, const int sizeY) {
    if (index.x < 0 || index.x >= sizeX ||
		index.y < 0 || index.y >= sizeY) {
			return false;
	}
    return true;
}

static int3 calcIndex3DFromIndex1D(const int i, __global __read_only int *size) {
    // Compute 3D index in data.
    const int layerSize = size[0] * size[1];
    const int z = i / layerSize;
	const int layer = i % layerSize;
    const int y = layer / size[0];
    const int x = layer % size[0];
    const int3 index3D = { x, y, z };
    return index3D;
}

static int2 calcIndex2DFromIndex1D(const int i, __global __read_only int *size) {
    // Compute 2D index in data.
    const int y = i / size[0];
    const int x = i % size[0];
    const int2 index3D = { x, y };
    return index3D;
}

static int calcIndex1DFromIndex3D(const int3 index3D, __global __read_only int *size) {
	return index3D.z * size[0] * size[1] + index3D.y * size[0] + index3D.x;
}

static int3 calcIndex3DFromPosition3D(const float3 position3D) {
    const int3 index3D = convert_int3(floor(position3D));
    return index3D;
}

static float3 calcPosition3DFromIndex3D(const int3 index3D) {
    const float3 position = convert_float3(index3D);
    return position + 0.5f;
}

static float3 calcPosition3DFromIndex1D(const int i, __global __read_only int *size) {
    // Compute 3D index in data.
    const int3 index3D = calcIndex3DFromIndex1D(i, size);
    const float3 position = calcPosition3DFromIndex3D(index3D);
    return position;
}


static float getValFromIndex3D_ZeroBoundary_uchar(const int3 index3D, __global __read_only uchar *data, __global __read_only int *size) {
	if (!index3DInBounds(index3D, size)) {
		return 0.0f;
	}
    return convert_float(data[index3D.z * size[0] * size[1] + index3D.y * size[0] + index3D.x]);
}

static float getValFromIndex3D_ZeroBoundary(const int3 index3D, __global __read_only float *data, __global __read_only int *size) {
	if (!index3DInBounds(index3D, size)) {
		return 0.0f;
	}
    return data[index3D.z * size[0] * size[1] + index3D.y * size[0] + index3D.x];
}

// static float getValFromIndex3D_NearestBoundary(const int3 index3D, __global __read_only float *data, __global __read_only int *size) {
// 	// Get nearest index on boundary.
// 	int x = index3D.x;
// 	int y = index3D.y;
// 	int z = index3D.z;
//     if (x < 0) {
//         x = 0;
//     }
//     if (y < 0) {
//         y = 0;
//     }
//     if (z < 0) {
//         z = 0;
//     }
//     if (x >= size[0]) {
//         x = size[0] - 1;
//     }
//     if (y >= size[1]) {
//         y = size[1] - 1;
//     }
//     if (z >= size[2]) {
//         z = size[2] - 1;
//     }
//     return data[z * size[0] * size[1] + y * size[0] + x];
// }

static float trilinearInterpolation(const float3 position, __global __read_only float *data, __global __read_only int *size) {
    const float3 mid = round(position);
    const float3 max = mid + 0.5f;
    const float3 min = mid - 0.5f;

    // Interpolate in x-direction.
    const float maxDiffX = max.x - position.x;
    const float minDiffX = position.x - min.x;
	int3 index3D_min = {min.x - 0.5f, min.y - 0.5f, min.z - 0.5f};
	int3 index3D_max = {max.x - 0.5f, min.y - 0.5f, min.z - 0.5f};
    const float pixel_y0z0 = getValFromIndex3D_ZeroBoundary(index3D_min, data, size) * maxDiffX +
        getValFromIndex3D_ZeroBoundary(index3D_max, data, size) * minDiffX;
	index3D_min.y = min.y - 0.5f;
	index3D_max.y = min.y - 0.5f;
	index3D_min.z = max.z - 0.5f;
	index3D_max.z = max.z - 0.5f;
    const float pixel_y0z1 = getValFromIndex3D_ZeroBoundary(index3D_min, data, size) * maxDiffX +
        getValFromIndex3D_ZeroBoundary(index3D_max, data, size) * minDiffX;
	index3D_min.y = max.y - 0.5f;
	index3D_max.y = max.y - 0.5f;
	index3D_min.z = min.z - 0.5f;
	index3D_max.z = min.z - 0.5f;
    const float pixel_y1z0 = getValFromIndex3D_ZeroBoundary(index3D_min, data, size) * maxDiffX +
        getValFromIndex3D_ZeroBoundary(index3D_max, data, size) * minDiffX;
	index3D_min.y = max.y - 0.5f;
	index3D_max.y = max.y - 0.5f;
	index3D_min.z = max.z - 0.5f;
	index3D_max.z = max.z - 0.5f;
    const float pixel_y1z1 = getValFromIndex3D_ZeroBoundary(index3D_min, data, size) * maxDiffX +
        getValFromIndex3D_ZeroBoundary(index3D_max, data, size) * minDiffX;

    // Interpolate in y-direction.
    const float maxDiffY = max.y - position.y;
    const float minDiffY = position.y - min.y;
    const float pixel_z0 = pixel_y0z0 * maxDiffY + pixel_y1z0 * minDiffY;
    const float pixel_z1 = pixel_y0z1 * maxDiffY + pixel_y1z1 * minDiffY;

    // Interpolate in the z-direction.
    const float maxDiffZ = max.z - position.z;
    const float minDiffZ = position.z - min.z;
    const float pixel = pixel_z0 * maxDiffZ + pixel_z1 * minDiffZ;

    return pixel;
}

static float trilinearInterpolation_uchar(const float3 position, __global __read_only uchar *data, __global __read_only int *size) {
    const float3 mid = round(position);
    const float3 max = mid + 0.5f;
    const float3 min = mid - 0.5f;

    // Interpolate in x-direction.
    const float maxDiffX = max.x - position.x;
    const float minDiffX = position.x - min.x;
	int3 index3D_min = {min.x - 0.5f, min.y - 0.5f, min.z - 0.5f};
	int3 index3D_max = {max.x - 0.5f, min.y - 0.5f, min.z - 0.5f};
    const float pixel_y0z0 = getValFromIndex3D_ZeroBoundary_uchar(index3D_min, data, size) * maxDiffX +
        getValFromIndex3D_ZeroBoundary_uchar(index3D_max, data, size) * minDiffX;
	index3D_min.y = min.y - 0.5f;
	index3D_max.y = min.y - 0.5f;
	index3D_min.z = max.z - 0.5f;
	index3D_max.z = max.z - 0.5f;
    const float pixel_y0z1 = getValFromIndex3D_ZeroBoundary_uchar(index3D_min, data, size) * maxDiffX +
        getValFromIndex3D_ZeroBoundary_uchar(index3D_max, data, size) * minDiffX;
	index3D_min.y = max.y - 0.5f;
	index3D_max.y = max.y - 0.5f;
	index3D_min.z = min.z - 0.5f;
	index3D_max.z = min.z - 0.5f;
    const float pixel_y1z0 = getValFromIndex3D_ZeroBoundary_uchar(index3D_min, data, size) * maxDiffX +
        getValFromIndex3D_ZeroBoundary_uchar(index3D_max, data, size) * minDiffX;
	index3D_min.y = max.y - 0.5f;
	index3D_max.y = max.y - 0.5f;
	index3D_min.z = max.z - 0.5f;
	index3D_max.z = max.z - 0.5f;
    const float pixel_y1z1 = getValFromIndex3D_ZeroBoundary_uchar(index3D_min, data, size) * maxDiffX +
        getValFromIndex3D_ZeroBoundary_uchar(index3D_max, data, size) * minDiffX;

    // Interpolate in y-direction.
    const float maxDiffY = max.y - position.y;
    const float minDiffY = position.y - min.y;
    const float pixel_z0 = pixel_y0z0 * maxDiffY + pixel_y1z0 * minDiffY;
    const float pixel_z1 = pixel_y0z1 * maxDiffY + pixel_y1z1 * minDiffY;

    // Interpolate in the z-direction.
    const float maxDiffZ = max.z - position.z;
    const float minDiffZ = position.z - min.z;
    const float pixel = pixel_z0 * maxDiffZ + pixel_z1 * minDiffZ;

    return pixel;
}
static float4 quaternionFromUnitVectors(const float3 v1, const float3 v2) {
    // Copied from THREE.Quaternion.
    float r = dot(v1, v2) + 1.0f;
    if (r < 0.000001f) {
        r = 0.0f;
        if (fabs(v1.x) > fabs(v1.z)) {
            const float4 quaternion = {-v1.y, v1.x, 0, r};
            return normalize(quaternion);
        } else {
            const float4 quaternion = {0, -v1.z, v1.y, r};
            return normalize(quaternion);
        }
    }
    const float3 crossProd = cross(v1, v2);
    const  float4 quaternion = {crossProd.x, crossProd.y, crossProd.z, r};
    return normalize(quaternion);
}

static float3 applyQuaternion(const float3 vector, const float4 quaternion) {
    // Copied from THREE.Quaternion.
    // Calculate quat * vector.
    const float ix = quaternion.w * vector.x + quaternion.y * vector.z - quaternion.z * vector.y;
    const float iy = quaternion.w * vector.y + quaternion.z * vector.x - quaternion.x * vector.z;
    const float iz = quaternion.w * vector.z + quaternion.x * vector.y - quaternion.y * vector.x;
    const float iw = - quaternion.x * vector.x - quaternion.y * vector.y - quaternion.z * vector.z;

    // Calculate result * inverse quat.
    const float3 result = {ix * quaternion.w + iw * - quaternion.x + iy * - quaternion.z - iz * - quaternion.y,
        iy * quaternion.w + iw * - quaternion.y + iz * - quaternion.x - ix * - quaternion.z,
        iz * quaternion.w + iw * - quaternion.z + ix * - quaternion.y - iy * - quaternion.x};
    return result;
}

static float3 calcBarycentricCoords(const float2 subPixelPosition2D, const float2 p1, const float2 p2, const float2 p3) {
    const float2 v0 = {p2.x - p1.x, p2.y - p1.y};
    const float2 v1 = {p3.x - p1.x, p3.y - p1.y};
    const float2 v2 = {subPixelPosition2D.x - p1.x, subPixelPosition2D.y - p1.y};
    const float d00 = dot(v0, v0);
    const float d01 = dot(v0, v1);
    const float d11 = dot(v1, v1);
    const float d20 = dot(v2, v0);
    const float d21 = dot(v2, v1);
    const float denom = d00 * d11 - d01 * d01;
    const float v = (d11 * d20 - d01 * d21) / denom;
    const float w = (d00 * d21 - d01 * d20) / denom;
    const float u = 1 - v - w;
    const float3 barycentric = {u, v, w};
    return barycentric;
}

static float3 interpVectorBarycentric(const float3 barycentric, const float3 v1, const float3 v2, const float3 v3) {
    return v1 * barycentric.x + v2 * barycentric.y + v3 * barycentric.z;
}

// TODO: we have a hard limit here because some version of opencl do not allow variable length array allocations.
// This could create a problem if the array to be sorted is very large.
static void sortAscending(float *metric, int *array, const int num) {
    // float sortedMetric[num + 1];
    // int sortedArray[num + 1];
	float sortedMetric[30];
    int sortedArray[30];
    // TODO: this should be done with qsort (or similar) in the future.
    for (int j = 0; j <= num; j++) {
        sortedMetric[j] = INFINITY;
        sortedArray[j] = -1;
    }
    for (int j = 0; j < num; j++) {
        if(metric[j] < sortedMetric[num]){
            sortedMetric[num] = metric[j];
            sortedArray[num] = array[j];
            for(int k = num; k > 0; k--){
                if(sortedMetric[k] < sortedMetric[k - 1]) {
                    float tempMetric = sortedMetric[k];
                    sortedMetric[k] = sortedMetric[k - 1];
                    sortedMetric[k - 1] = tempMetric;
                    int tempVal = sortedArray[k];
                    sortedArray[k] = sortedArray[k - 1];
                    sortedArray[k - 1] = tempVal;
                } else break;
            }
        }
    }
    for (int j = 0; j < num; j++) {
        metric[j] = sortedMetric[j];
        array[j] = sortedArray[j];
    }
}