import { orderNeighborsCC } from '../../common/CalcMeshNormals';
import MutableTypedArray from '../../common/MutableTypedArray';
import { gpuHelper } from '../../globals/gpuHelper';
const path = 'output/DB-2199_1492x303x2377';

// Translating from our old format to new format.
// TODO: delete this eventually.

const pos3D = MutableTypedArray.initFromVol(
	path,
	'/OLD_letter7_1492x303x2377_Mesh2_OriginalPositions',
	'float32',
	true,
	3,
);
// pos3D.saveAsBin('', `${path}_points3DList`);
// let pos2D = MutableTypedArray.initFromVol(
// 	path,
// 	'/OLD_letter7_1492x303x2377_Mesh2_FinalPositions',
// 	'float32',
// 	true,
// 	3,
// );
// pos2D = pos2D.convertToVector2();
// pos2D.saveAsBin('', `${path}_points2DList`);
const normals = MutableTypedArray.initFromVol(
	path,
	'/OLD_letter7_1492x303x2377_Mesh2_Normals',
	'float32',
	true,
	3,
);
// normals.saveAsBin('', `${path}_normalsList`);
const neighbors = MutableTypedArray.initFromVol(
	path,
	'/OLD_letter7_1492x303x2377_Mesh2_MeshNeighbors',
	'int32',
	true,
	10,
);
// Finally reorder all neighbors so that they are in CC order around point relative to normal.
gpuHelper.createGpuBufferFromMutableTypedArray('points', pos3D, 'read', pos3D.getLength(), true);
gpuHelper.createGpuBufferFromMutableTypedArray('normals', normals, 'read', normals.getLength(), true);
gpuHelper.createGpuBufferFromMutableTypedArray('meshNeighbors', neighbors, 'readwrite', neighbors.getLength(), true);
orderNeighborsCC(gpuHelper, {
	pointsBufferName: 'points',
	neighborsBufferName: 'meshNeighbors',
	normalsBufferName: 'normals',
}, pos3D.getLength(), 10);
gpuHelper.copyDataToMutableTypedArray('meshNeighbors', neighbors);
neighbors.saveAsBin('', `${path}_meshNeighborsList`);
// const iterNum = new MutableTypedArray(new Int32Array(pos3D.getLength()), true, 1);
// iterNum.saveAsBin('', `${path}_iterMappedList`);
// const meshNumbers = new MutableTypedArray(new Int32Array(pos3D.getLength()), true, 1);
// meshNumbers.saveAsBin('', `${path}_meshNumbersList`);