const Vector3 = require('../../dependencies/Vector3');
const Quaternion = require('../../dependencies/Quaternion');

const utils = require('./utils');
const { globals } = require('../globals');
/**
 * geom is a namespace for storing methods for doing various
 * geometric operations
 *
 * geom does not contain any state
 */
const geom = {

    /**
     * order neighbors counterclockwise around a central position and normal vector
     * @param {Array} neighbors array of neighbor indices
     * @param {Array} neighborPositions array of neighbor positions (Vector3's)
     * @param {Vector3} position central position
     * @param {Vector3} normal central normal
     * @returns {Array} array of neighbor indices, oriented in CC order
     */
    orderNeighborsCC: (neighbors, neighborsPositions, position, normal) => {
        const quaternion = (new Quaternion())
            .setFromUnitVectors(normal.normalize(), new Vector3(0, 0, 1));

        const orderedNeighbors = [];
        for (let i = 0; i < neighbors.length; i++) {
            const edgeVector = neighborsPositions[i].clone().sub(position);
            edgeVector.applyQuaternion(quaternion);
            // calculate each angle with respect to the x-axis
            const angle = Math.atan2(edgeVector.y, edgeVector.x);
            orderedNeighbors.push([angle, neighbors[i]]);
        }
        orderedNeighbors.sort((a, b) => {
            return a[0] - b[0];
        });
        return orderedNeighbors.map(element => element[1]);
    },

    /**
     * order neighbors counterclockwise around a central position and normal vector
     * @param {Array} neighbors array of neighbor indices
     * @param {Array} neighborPositions array of neighbor positions (Vector3's)
     * @param {Vector3} position central position
     * @param {Vector3} normal central normal
     * @returns {Array} array of neighbor indices, oriented in CC order
     */
    orderNeighborsCCandReindex: (neighbors, neighborsPositions, position, normal) => {
        const quaternion = (new Quaternion())
            .setFromUnitVectors(normal.normalize(), new Vector3(0, 0, 1));

        let orderedNeighbors = [];
        for (let i = 0; i < neighbors.length; i++) {
            const edgeVector = neighborsPositions[i].clone().sub(position);
            edgeVector.applyQuaternion(quaternion);
            // calculate each angle with respect to the x-axis
            const angle = Math.atan2(edgeVector.y, edgeVector.x);
            orderedNeighbors.push([angle, neighbors[i]]);
        }
        orderedNeighbors.sort((a, b) => {
            return a[0] - b[0];
        });
        // Find angle between each pair.
        const interiorAngles = orderedNeighbors.map((neighborAndAngle, i) => {
            const prevIndex = (i - 1 + orderedNeighbors.length) % orderedNeighbors.length;
            let angle = neighborAndAngle[0] - orderedNeighbors[prevIndex][0];
            if (angle < 0) {
                angle += Math.PI * 2;
            }
            return angle;
        });
        // Find max index in interior angles.
        let max = 0;
        let maxIndex = 0;
        interiorAngles.forEach((angle, i) => {
            if (angle > max) {
                max = angle;
                maxIndex = i;
            }
        });
        orderedNeighbors = orderedNeighbors.slice(maxIndex)
            .concat(orderedNeighbors.slice(0, maxIndex));
        return orderedNeighbors.map(element => element[1]);
    },

    /**
     * calculate mesh normal based on weighted face normals
     * @param {Array} orderedNeighborsPositions array of CC ordered neighbor positions (Vector3's)
     * @param {Vector3} position central position
     * @param {Vector3} normal central normal
     * @returns {Vector3} mesh normal
     */
    calcMeshNormal: (orderedNeighborsPositions, position, normal) => {
        if (orderedNeighborsPositions.length < 3) return normal.clone();
        // find biggest break in neighbors
        const anglesAndNormals = [];
        let maxAngle = 0;
        let maxIndex = -1;
        for (let i = 0; i < orderedNeighborsPositions.length; i++) {
            let nextIndex = i + 1;
            if (nextIndex >= orderedNeighborsPositions.length) nextIndex = 0;
            const v1 = orderedNeighborsPositions[i].clone().sub(position);
            const v2 = orderedNeighborsPositions[nextIndex].clone().sub(position);

            const faceNormal = (v1.clone().cross(v2)).normalize();
            // remove any flipped facesNormals, these correspond to components with > Math.PI ang
            if (faceNormal.dot(normal) < 0) {
                // TODO: why is this < 0 ? shouldn't it be > 0 ?
                continue;
            }

            const angle = v1.angleTo(v2);
            anglesAndNormals.push([angle, faceNormal]);
            if (angle > maxAngle) {
                maxAngle = angle;
                maxIndex = anglesAndNormals.length - 1;
            }
        }
        if (maxIndex < 0) {
            // console.log(anglesAndNormals, orderedNeighborsPositions, position, normal);
            console.log('Unable to calculate mesh normal.');
            return normal.clone();
            throw new Error('Unable to calculate mesh normal.');
        }
        if (maxAngle > Math.PI / 2) {
            anglesAndNormals.splice(maxIndex, 1);// remove largest element if bigger than 90 deg
        }
        return anglesAndNormals.reduce((val, element) => {
            return val.add(element[1].multiplyScalar(element[0]));
        }, new Vector3(0, 0, 0)).normalize();
    },

    /**
     * sort an array of positions by distance from a central position
     * @param {Array} positions array of positions (Vector3's)
     * @param {Vector3} position central position to compare with
     * @returns {Array} array of Vector3's, sorted by distance
     */
    sortByDistance: (positions, position) => {
        const distances = [];
        for (let i = 0; i < positions.length; i++) {
            const distSq = (position.clone().sub(positions[i])).lengthSq();
            distances.push([distSq, positions[i]]);
        }
        distances.sort((a, b) => {
            return a[0] - b[0];
        });
        return distances.map(element => element[1]);
    },

    sortArrayByDistance: (array, positions, position) => {
        const distances = [];
        for (let i = 0; i < positions.length; i++) {
            const distSq = (position.clone().sub(positions[i])).lengthSq();
            distances.push([distSq, array[i]]);
        }
        distances.sort((a, b) => {
            return a[0] - b[0];
        });
        return distances.map(element => element[1]);
    },

    voxelCutByPlane: (position, normal, voxCenter) => {
        // https://gamedev.stackexchange.com/questions/75756/sphere-sphere-intersection-and-circle-sphere-intersection
        // check if any part of this voxel is perp to normal from position
        const d = normal.dot(position.clone().sub(voxCenter));
        if (Math.abs(d) < 0.6) { // 0.6 is rad of sphere that contains a voxel
            return true;
        }
        return false;
    },

    /**
     * get the position of the center of the voxel that 'position' lies inside
     * @param {Vector3} position position somewhere inside voxel
     * @returns {Vector3} center of voxel
     */
    centerOfVoxelFromPosition: (position) => {
        const index = utils.positionToIndex3D(position);
        return geom.centerOfVoxelFromIndex(index);
    },

    /**
     * get the position of the center of the voxel corresponding to 'index'
     * @param {Vector3} index 3D index of voxel
     * @returns {Vector3} center of voxel
     */
    centerOfVoxelFromIndex: (index) => {
        return index.clone().addScalar(0.5);
    },

    /**
     * project a point to plane
     * @param {Vector3} position reference position on plane
     * @param {Vector3} normal reference normal (defines plane)
     * @param {Vector3} posToProject position to project to plane
     * @returns {Vector3} center of voxel
     */
    projectToPlane: (position, normal, posToProject) => {
        // https://stackoverflow.com/questions/9605556/how-to-project-a-point-onto-a-plane-in-3d
        const t = ((position.clone().sub(posToProject)).dot(normal));
        return (posToProject.clone()).add(normal.clone().multiplyScalar(t));
    },

    getNormalizedEdgesTo(centerPosition, neighborPositions) {
        return neighborPositions.map(position =>
            (position.clone().sub(centerPosition)).normalize());
    },

    testMinMeshAngle: (centerPosition, neighborPositions, testPosition, angle) => {
        const neighborEdges = geom.getNormalizedEdgesTo(centerPosition, neighborPositions);
        return geom._testMinMeshAngle(centerPosition, neighborEdges, testPosition, angle);
    },

    _testMinMeshAngle: (centerPosition, neighborEdges,
        testPosition, angle) => {
        let cosAngle;
        if (angle === undefined) cosAngle = globals.cosMinMeshAngle;
        else cosAngle = Math.cos(angle);
        const testEdge = (testPosition.clone().sub(centerPosition)).normalize();
        for (let i = 0; i < neighborEdges.length; i++) {
            const dot = neighborEdges[i].dot(testEdge);
            if (dot > cosAngle) { // test in cosine space to avoid acos operations
                return false;
            }
        }
        return true;
    },

    filterByMinMeshAngle: (centerPosition, neighborPositions, testPositions, angle) => {
        const neighborEdges = geom.getNormalizedEdgesTo(centerPosition, neighborPositions);
        return testPositions.filter(testPosition =>
            geom._testMinMeshAngle(centerPosition, neighborEdges, testPosition, angle));
    },

    /**
     * @param {Array} sortedNeighborIndices neighbor indices, sorted by distance
     */
    meshPtWithNeighbors: (position, sortedNeighborIndices, sortedNeighborPositions,
        angle = globals.minMeshAngle) => {
        const neighbors = [];
        const edgeVecs = [];

        // dist threshold
        for (let i = 0; i < sortedNeighborIndices.length; i++) {
            const neighborPosition = sortedNeighborPositions[i];
            const edgeVector = (neighborPosition.clone().sub(position)).normalize();
            // check that this neighbor doesn't collide with any others that have already been added
            if (geom._testMinMeshAngle(position, edgeVecs, neighborPosition, angle)) {
                neighbors.push(sortedNeighborIndices[i]);
                edgeVecs.push(edgeVector);
            }
        }

        return neighbors;
    },

    // assumes edgeVec is normalized
    perpToNormal: (edgeVec, normal, angle) => {
        let cosAngle;
        if (angle !== undefined) cosAngle = Math.abs(Math.cos(Math.PI / 2 - angle));
        else cosAngle = globals.cosNormalAngleDevThreshold;

        // the neighbor is valid if the angle between the two vectors is in the range of pi/2 +- angle_range
        const dot = edgeVec.dot(normal);
        if (Math.abs(dot) > cosAngle) return false;
        return true;
    },

    /**
     * https://stackoverflow.com/questions/17770555/how-to-check-if-a-point-is-inside-an-ellipsoid
     */
    filterPtsInEllipsoid: (array, positions, center, normal, a, b, c) => {
        const zAxis = new Vector3(0, 0, 1);
        const v1 = normal.equals(zAxis) ? new Vector3(1, 0, 0) : (normal.clone().cross(zAxis)).normalize();
        const v2 = (normal.clone().cross(v1)).normalize();
        return array.filter((val, i) => {
            const position = positions[i];
            const edge = position.clone().sub(center);
            const _x = edge.dot(normal);
            const _y = edge.dot(v1);
            const _z = edge.dot(v2);
            const vec = new Vector3(_x / c, _y / b, _z / a);
            return vec.lengthSq() <= 1;
        });
    },

    filterVoxelsInEllipsoid: (array, positions, center, normal, a, b, c, sphereRad) => {
        const zAxis = new Vector3(0, 0, 1);
        const v1 = normal.equals(zAxis) ? new Vector3(1, 0, 0) : (normal.clone().cross(zAxis)).normalize();
        const v2 = (normal.clone().cross(v1)).normalize();
        // const quaternion = (new THREE.Quaternion()).setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);
        const sphereRadSq = sphereRad * sphereRad;
        return array.filter((val, i) => {
            const position = positions[i];
            let edge = position.clone().sub(center);

            if (edge.lengthSq() <= sphereRadSq) return true;

            const _x = edge.dot(normal);
            const _y = edge.dot(v1);
            if (Math.abs(_y) > b + sphereRad) return false;
            const _z = edge.dot(v2);
            if (Math.abs(_z) > a + sphereRad) return false;
            let vec = new Vector3(_x / c, _y / b, _z / a);
            const vecLength = vec.length();

            if (vecLength <= 1) return true;

            // vec.applyQuaternion(quaternion);
            const vecGlobalCoords = (normal.clone().multiplyScalar(vec.x)).add(v1.clone().multiplyScalar(vec.y)).add(v2.clone().multiplyScalar(vec.z));
            vecGlobalCoords.normalize().multiplyScalar(sphereRad);

            const offsetPosition = position.clone().sub(vecGlobalCoords);
            // console.log(offsetPosition);
            edge = offsetPosition.clone().sub(center);
            const _x2 = edge.dot(normal);
            const _y2 = edge.dot(v1);
            const _z2 = edge.dot(v2);

            // check if we've cross into another octant
            if (Math.sign(_x2 * _x) === -1 || Math.sign(_y2 * _y) === -1 || Math.sign(_z2 * _z) === -1) return true;

            vec = new Vector3(_x2 / c, _y2 / b, _z2 / a);
            return vec.lengthSq() <= 1;
        });

        // // find closest point on the sphere to the ellipsoid
        // // if that point is in the ellipsoid, return true
        // const closestPtsArray = [];
        // // console.log(array);
        // for (let i = 0; i < array.length; i++) {
        //     const position = positions[i];
        //     const origDist = center.clone().sub(position).length();
        //     const edge = center.clone().sub(position).normalize();
        //     const checkPt = position.clone().add(edge.multiplyScalar(sphereRad));
        //     if (checkPt.clone().sub(position).length() > origDist) console.log('here');
        //     closestPtsArray.push(checkPt);
        // }
        // return geom.filterPtsInEllipsoid(array, closestPtsArray, center, normal, a, b, c);
    },

    getIndicesWithinRadius(index3D, radius, ptsIndices, ptsIndicesOverflow, noDuplicatesInSameVoxel, position, ptsArray) {
        const radiusInt = Math.ceil(radius);
        // const radiusSq = radiusInt*radiusInt;
        const neighbors = [];
        for (let z = -radiusInt; z <= radiusInt; z++) {
            for (let y = -radiusInt; y <= radiusInt; y++) {
                for (let x = -radiusInt; x <= radiusInt; x++) {
                    // if (x*x+y*y+z*z > radiusSq) continue;
                    const neighborIndex3D = index3D.clone().add(new THREE.Vector3(x, y, z));
                    if (!utils.index3DInBounds(neighborIndex3D, globals.dimensions)) continue;
                    let voxIndices = geom.getIndicesInVoxel(neighborIndex3D, ptsIndices, ptsIndicesOverflow);
                    if (noDuplicatesInSameVoxel && voxIndices.length > 1) {
                        const positions = voxIndices.map(index => ptsArray.getVector3(index));
                        let minDist = Infinity;
                        let minIndex = -1;
                        for (let i = 0; i < positions.length; i++) {
                            const dist = (positions[i].sub(position)).lengthSq();
                            if (dist < minDist) {
                                minDist = dist;
                                minIndex = i;
                            }
                        }
                        voxIndices = [voxIndices[minIndex]];
                    }
                    neighbors.push(...voxIndices);
                }
            }
        }
        return neighbors;
    },

    getIndicesInVoxel(index3D, ptsIndices, ptsIndicesOverflow) {
        // There may be more than one pt index per voxel.
        const indices = [];
        // First get the index in ptsIndices.
        const index = ptsIndices.get(index3D.x, index3D.y, index3D.z);
        if (index === null) return indices;
        indices.push(index);
        // Then check to see if any are stored in the overflow array.
        // This works kind of like a linked list.
        return geom.getFromOverflow(indices, index, ptsIndicesOverflow);
    },

    getFromOverflow(indices, index, ptsIndicesOverflow) {
        const nextIndex = ptsIndicesOverflow.get(index);
        if (nextIndex === null) return indices;
        indices.push(nextIndex);
        // Recursively get from overflow til there are not more indices to add.
        // This is potentially dangerous, but have not seen a stack overflow yet.
        return geom.getFromOverflow(indices, nextIndex, ptsIndicesOverflow);
    },

    connectPtToNeighbor(i, neighborIndex, ptsArray1D, normalsArray1D, neighborsArray1D, lengthsArray1D) {
        const neighborPosition = ptsArray1D.getVector3(neighborIndex);
        const neighborNormal = normalsArray1D.getVector3(neighborIndex);
        let neighborNeighbors = neighborsArray1D.get(neighborIndex);
        if (neighborNeighbors.indexOf(i) >= 0) {
            return;
        }
        neighborNeighbors.push(i);

        // get all current lengths
        const originalLengths = lengthsArray1D.get(neighborIndex);
        originalLengths.push((ptsArray1D.getVector3(neighborIndex).sub(ptsArray1D.getVector3(i))).length());

        const hash = {};
        for (let j = 0; j < neighborNeighbors.length; j++) {
            hash[neighborNeighbors[j]] = originalLengths[j];
        }

        // sort neighbors cc
        neighborNeighbors = geom.orderNeighborsCC(neighborNeighbors,
            neighborNeighbors.map(index => ptsArray1D.getVector3(index)), neighborPosition, neighborNormal);
        neighborsArray1D.set(neighborIndex, neighborNeighbors);

        // recalc normal based on mesh
        const neighborMeshNormal = geom.calcMeshNormal(neighborNeighbors.map(_index =>
            ptsArray1D.getVector3(_index)), neighborPosition, neighborNormal);
        normalsArray1D.setVector3(neighborIndex, neighborMeshNormal);

        // calc length
        const lengths = neighborNeighbors.map((_index) => {
            return hash[_index];
        });
        lengthsArray1D.set(neighborIndex, lengths);
    },
};

module.exports = geom;
