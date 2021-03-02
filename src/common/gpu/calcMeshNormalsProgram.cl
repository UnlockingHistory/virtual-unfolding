#import "src/common/gpu/utils.cl"

__kernel void calcMeshNormals(
	__global __read_only float *points,
	__global __read_only float *normalsRef,
	__global __read_only int *neighbors,
	__global __write_only float *meshNormals
) {
    const size_t i =  get_global_id(0);

    const float pointX = points[3 * i];
    if (pointX == NULL_FLOAT32) {
        return;
    }
    const float3 point = {pointX, points[3 * i + 1], points[3 * i + 2]};
    const float3 normalRef = {normalsRef[3 * i], normalsRef[3 * i + 1], normalsRef[3 * i + 2]};

    // Get all neighbors and their angles relative to a ref.
    int pointNeighbors[MAX_NUM_NEIGHBORS];
    int numNeighbors = 0;
    for (int j = 0; j < MAX_NUM_NEIGHBORS; j++) {
        int neighborIndex = neighbors[i * MAX_NUM_NEIGHBORS + j];
        if (neighborIndex == NULL_INT32) {
            break;
        }
        numNeighbors++;
        pointNeighbors[j] = neighborIndex;
   }

   if (numNeighbors == 0) {
       return;
   }

    // Geometric avg of adjacent face normals.
    float3 faceNormals[MAX_NUM_NEIGHBORS];
    float faceIncludedAngles[MAX_NUM_NEIGHBORS];
    float maxAngle = 0;
    int maxIndex = -1;
    for (int j = 0; j < numNeighbors; j++) {
		// Set default value.
		faceIncludedAngles[j] = 0;
		faceNormals[j] = 0;

        int nextIndex = j + 1;
        if (nextIndex >= numNeighbors) {
            nextIndex = 0;
        }
        const int neighborIndex1 = pointNeighbors[j];
        const int neighborIndex2 = pointNeighbors[nextIndex];
        float3 v1 = {points[3 * neighborIndex1], points[3 * neighborIndex1 + 1], points[3 * neighborIndex1 + 2]};
        float3 v2 = {points[3 * neighborIndex2], points[3 * neighborIndex2 + 1], points[3 * neighborIndex2 + 2]};
		// Check if positions are valid.
		if (v1.x == NULL_FLOAT32 || v2.x == NULL_FLOAT32) {
			continue;
		}
        v1 = normalize(v1 - point);
        v2 = normalize(v2 - point);

        const float3 faceNormal = cross(v1, v2);
        if (dot(faceNormal, normalRef) < 0.0f) {
            continue;
        }
        float cosAngle = dot(v1, v2);
        if (cosAngle > 1.0f) cosAngle = 1.0f;
        if (cosAngle < -1.0f) cosAngle = -1.0f;
        const float angle = acos(cosAngle);
        faceIncludedAngles[j] = angle;
        faceNormals[j] = faceNormal;
        if (angle > maxAngle) {
            maxAngle = angle;
            maxIndex = j;
        }
    }

    if (maxIndex < 0) {
        return;
    }
    if (maxAngle > M_PI / 2.0f) {
        // Remove largest element if bigger than 90 deg.
        faceIncludedAngles[maxIndex] = 0;
        faceNormals[maxIndex] = 0;
    }
    
    float3 meshNormal = faceIncludedAngles[0] * faceNormals[0];
    for (int j = 1; j < numNeighbors; j++) {
        meshNormal += faceIncludedAngles[j] * faceNormals[j];
    }
    meshNormal = normalize(meshNormal);

    meshNormals[3 * i] = meshNormal.x;
    meshNormals[3 * i + 1] = meshNormal.y;
    meshNormals[3 * i + 2] = meshNormal.z;
}

__kernel void calcMeshNormals2D(
	__global __read_only float *points,
	__global __read_only int *neighbors,
	__global __write_only float *meshNormals
) {
    const size_t i =  get_global_id(0);

    const float pointX = points[2 * i];
    if (pointX == NULL_FLOAT32) {
        return;
    }
    const float3 point = {pointX, points[2 * i + 1], 0};

    // Get all neighbors and their angles relative to a ref.
    int pointNeighbors[MAX_NUM_NEIGHBORS];
    int numNeighbors = 0;
    for (int j = 0; j < MAX_NUM_NEIGHBORS; j++) {
        int neighborIndex = neighbors[i * MAX_NUM_NEIGHBORS + j];
        if (neighborIndex == NULL_INT32) {
            break;
        }
        numNeighbors++;
        pointNeighbors[j] = neighborIndex;
   }

   if (numNeighbors == 0) {
       return;
   }

    // Geometric avg of adjacent face normals.
    float3 faceNormals[MAX_NUM_NEIGHBORS];
    float faceIncludedAngles[MAX_NUM_NEIGHBORS];
    float maxAngle = 0;
    int maxIndex = -1;
    for (int j = 0; j < numNeighbors; j++) {
		// Set default value.
		faceIncludedAngles[j] = 0;
		faceNormals[j] = 0;

        int nextIndex = j + 1;
        if (nextIndex >= numNeighbors) {
            nextIndex = 0;
        }
        const int neighborIndex1 = pointNeighbors[j];
        const int neighborIndex2 = pointNeighbors[nextIndex];
        float3 v1 = {points[2 * neighborIndex1], points[2 * neighborIndex1 + 1], 0};
        float3 v2 = {points[2 * neighborIndex2], points[2 * neighborIndex2 + 1], 0};
		// Check if positions are valid.
		if (v1.x == NULL_FLOAT32 || v2.x == NULL_FLOAT32) {
			continue;
		}
        v1 = normalize(v1 - point);
        v2 = normalize(v2 - point);

        const float3 faceNormal = cross(v1, v2);
        float cosAngle = dot(v1, v2);
        if (cosAngle > 1.0f) cosAngle = 1.0f;
        if (cosAngle < -1.0f) cosAngle = -1.0f;
        const float angle = acos(cosAngle);
        faceIncludedAngles[j] = angle;
        faceNormals[j] = faceNormal;
        if (angle > maxAngle) {
            maxAngle = angle;
            maxIndex = j;
        }
    }

    if (maxIndex < 0) {
        return;
    }
    if (maxAngle > M_PI / 2.0f) {
        // Remove largest element if bigger than 90 deg.
        faceIncludedAngles[maxIndex] = 0;
        faceNormals[maxIndex] = 0;
    }
    
    float3 meshNormal = faceIncludedAngles[0] * faceNormals[0];
    for (int j = 1; j < numNeighbors; j++) {
        meshNormal += faceIncludedAngles[j] * faceNormals[j];
    }
	meshNormal = normalize(meshNormal);

    meshNormals[3 * i] = 0;
    meshNormals[3 * i + 1] = 0;
	meshNormals[3 * i + 2] = sign(meshNormal.z);
}