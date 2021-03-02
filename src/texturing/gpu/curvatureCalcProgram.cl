// Calcs curvature values per 3D mesh point.

// #define PI 3.14159265359f
#define radius 5
#define approxNumNeighborsAtRadius 95 // 2PI*radius * 3 - safety factor of 3

static bool visited(const int neighborIndex, int *exclude, const int numExclude) {
    // #pragma unroll
    for (int j = 0; j < numExclude; j++) {
        if (exclude[j] == neighborIndex) {
            return true;
        }
    }
    return false;
}

// int int_compare(const void *x, const void *y) {
//   int i_x = *((int*)x);
//   int i_y = *((int*)y);
//   return i_x > i_y;
// }

__kernel void curvatureCalc(
	__global __write_only float *vertexCurvature,
	__global __read_only float *meshNormals,
    __global __read_only float *positions3D,
    __global __read_only float *positions2D,
	__global __read_only int *neighbors
) {
    const size_t i =  get_global_id(0);

    const float3 normal3D = {meshNormals[3*i], meshNormals[3*i + 1], meshNormals[3*i + 2]};
    const float3 position3D = {positions3D[3*i], positions3D[3*i + 1], positions3D[3*i + 2]};
    const float2 position2D = {positions2D[2*i], positions2D[2*i + 1]};
    // const float3 zVec = {0, 0, 1};
    // float4 quaternion = quaternionFromUnitVectors(normal3D, zVec);

    // Get all n ring neighbors.
    int lastRing[approxNumNeighborsAtRadius];
    int numLastRing = 0;
    int nextRing[approxNumNeighborsAtRadius];
    nextRing[0] = i;
    int numNextRing = 1;

    // #pragma unroll
    for (int hopCount = 1; hopCount <= radius; hopCount++) {
        // Copy everything from nextRing to lastRing.
        for (int j = 0; j < numNextRing; j++) {
            lastRing[j] = nextRing[j];
        }
        numLastRing = numNextRing;
        numNextRing = 0;
        // #pragma unroll
        for (int j = 0; j < numLastRing; j++) {
            const int ringIndex = lastRing[j];
            // Get distance of current ring vertex from center point.
            const float2 ringPosition2D = {positions2D[2*ringIndex], positions2D[2*ringIndex + 1]};
            const float2 ringVec2D = ringPosition2D - position2D;
            const float ringDistSq = dot(ringVec2D, ringVec2D);
            // #pragma unroll
            for (int k = 0; k < MAX_NUM_NEIGHBORS; k++) {
                const int neighborIndex = neighbors[MAX_NUM_NEIGHBORS*ringIndex+k];
                if (neighborIndex == NULL_INT32) {
                    continue;
                }
                // Test if this neighbor is closer in 2D.
                const float2 neighborPosition2D = {positions2D[2*neighborIndex], positions2D[2*neighborIndex + 1]};
                const float2 neighborVec2D = neighborPosition2D - position2D;
                const float neighborDistSq = dot(neighborVec2D, neighborVec2D);
                if (neighborDistSq < ringDistSq || visited(neighborIndex, lastRing, numLastRing) || visited(neighborIndex, nextRing, numNextRing)) {
                    continue;
                }
                nextRing[numNextRing] = neighborIndex;
                numNextRing++;
            }
        }
    }
    const int numNeighbors = numNextRing;
    if (numNeighbors == 0) {
        return;
    }

    // float ringAngles[numNeighbors];
    // for (int j = 0; j < numNeighbors; j++) {
    //     int neighborIndex = nextRing[j];
    //     float3 neighborPosition3D = {positions3D[3*neighborIndex],
    //         positions3D[3*neighborIndex + 1], positions3D[3*neighborIndex + 2]};
        
    //     float3 edgeVector = neighborPosition3D - position3D;
    //     applyQuaternion(edgeVector, quaternion);
    //     // Project the vectors completely flat onto the xy plane.
    //     edgeVector.z = 0;

    //     ringAngles[j] = atan2(edgeVector.y, edgeVector.x);
    // }

    // // Sort neighbors CC.
    // // qsort(nextRing, numNeighbors, sizeof(int), int_compare);
    // float sortedAngles[numNeighbors+1];
    // int sortedNeighbors[numNeighbors+1];
    // for(int j=0; j<=numNeighbors; j++){
    //     sortedAngles[j] = -INFINITY;
    //     sortedNeighbors[j] = -1;
    // }

    // for(int j=0; j<numNeighbors; j++){
    //     //Is it higher than the element 0?
    //     if(nextRing[j] > sortedAngles[0]){
    //         sortedAngles[0] = ringAngles[j];
    //         sortedNeighbors[0] = nextRing[j];
    //         for(int k=0; k<numNeighbors; k++){
    //             if(sortedAngles[k] > sortedAngles[k+1]) {
    //                 float tempAngle = sortedAngles[k];
    //                 sortedAngles[k] = sortedAngles[k+1];
    //                 sortedAngles[k+1] = tempAngle;
    //                 int tempNeighbor = sortedNeighbors[k];
    //                 sortedNeighbors[k] = sortedNeighbors[k+1];
    //                 sortedNeighbors[k+1] = tempNeighbor;
    //             } else break;
    //         }
    //     }
    // }

    // float curvGeoMean = 0;
    // for (int j = 1; j <= numNeighbors; j++) {
    //     int neighborIndex = sortedNeighbors[j];
    //     // printf('(%i ) ', neighborIndex);
    //     float3 neighborPos3D = {positions3D[3*neighborIndex], positions3D[3*neighborIndex + 1], positions3D[3*neighborIndex + 2]};
    //     float3 neighborNormal3D = {meshNormals[3*neighborIndex], meshNormals[3*neighborIndex + 1], meshNormals[3*neighborIndex + 2]};
    //     float3 edge = neighborPos3D - position3D;
    //     float3 normalDiff = neighborNormal3D - normal3D;
    //     float curvature = dot(normalDiff, edge)/dot(edge, edge);
    //     int prevIndex = j - 1;
    //     if (prevIndex == 0) prevIndex = numNeighbors;
    //     int nextIndex = j + 1;
    //     if (nextIndex > numNeighbors) nextIndex = 1;
    //     // if (i == 100) {
    //     //     printf('(%i, %i, %i ) ', prevIndex, nextIndex, j);
    //     // }
    //     int prevNeighborIndex = sortedNeighbors[prevIndex];
    //     int nextNeighborIndex = sortedNeighbors[nextIndex];
    //     int prevAngle = sortedAngles[prevAngle];
    //     int nextAngle = sortedAngles[nextIndex];
    //     // if (nextAngle < sortedAngles[j]) prevAngle += 2.0f * PI;
    //     // if (prevAngle > sortedAngles[j]) prevAngle -= 2.0f * PI;
    //     // var angleBefore = edgeAnglesDict[neighborBefore + ',' + currentNeighbor];
    //     // var angleAfter = edgeAnglesDict[currentNeighbor + ',' + neighborAfter];
    //     // curvGeoMean+=((0.5*(angleBefore+angleAfter)/totalAngleSum)*curvature);
    //     curvGeoMean += curvature;
    // }
    // curvGeoMean /= numNeighbors;
    // printf('(%f) ', curvGeoMean);

    // Calculate mean curvature.
    float curvGeoMean = 0;
    for (int j = 0; j < numNeighbors; j++) {
        const int neighborIndex = nextRing[j];
        const float3 neighborPos3D = {positions3D[3*neighborIndex], positions3D[3*neighborIndex + 1], positions3D[3*neighborIndex + 2]};
        const float3 neighborNormal3D = {meshNormals[3*neighborIndex], meshNormals[3*neighborIndex + 1], meshNormals[3*neighborIndex + 2]};
        const float3 edge = neighborPos3D - position3D;
        const float3 normalDiff = neighborNormal3D - normal3D;
        const float curvature = dot(normalDiff, edge)/dot(edge, edge);
        curvGeoMean += curvature;
    }
    curvGeoMean /= numNeighbors;

    vertexCurvature[i] = curvGeoMean;
}