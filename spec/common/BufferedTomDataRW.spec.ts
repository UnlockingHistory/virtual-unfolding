// const BufferedVolumetricDataRW = require('../src/common/BufferedVolumetricDataRW');
// const utils = require('../src/common/utils');

// function compValue(pos, dim, obj, solution, type) {
//     const i = utils.index3Dto1D(pos.x, pos.y, pos.z, dim);
//     const val = obj.get(pos.x, pos.y, pos.z);
//     if (solution[i] === utils.nullValForType(type)) {
//         expect(val).toBe(null);
//     } else {
//         expect(val).toEqual(solution[i]);
//     }
// }

// function compValues(pos, dim, obj, solution, type, numElements) {
//     const i = utils.index3Dto1D(pos.x, pos.y, pos.z, dim);
//     const values = obj.getValues(pos.x, pos.y, pos.z);
//     if (solution[numElements*i] === utils.nullValForType(type)) {
//         nullFound = true;
//         expect(values).toBe(null);
//     } else {
//         expect(values.length).toEqual(numElements);
//         for (let j = 0; j < numElements; j += 1){
//             expect(values[j]).toBeCloseTo(solution[(numElements * i) + j]);// python float output is shortened
//         }
//     }
// }

// function compVec3(pos, dim, obj, solution, type) {
//     const i = utils.index3Dto1D(pos.x, pos.y, pos.z, dim);
//     const vec = obj.getVector3(pos.x, pos.y, pos.z);
//     if (solution[3*i] === utils.nullValForType(type)) {
//         nullFound = true;
//         expect(vec).toBe(null);
//     } else {
//         expect(vec.x).toEqual(solution[3*i]);
//         expect(vec.y).toEqual(solution[3*i+1]);
//         expect(vec.z).toEqual(solution[3*i+2]);
//     }
// }

// function setterGetterTests(obj, dim, solution, type){
//     let numRandomTests = 10000;
//     while (numRandomTests-- > 0) {
//         const i = Math.floor(Math.random() * dim.x * dim.y * dim.z);
//         const pos = utils.index1Dto3D(i, dim);
//         compValue(pos, dim, obj, solution, type);
//         let val = (Math.random()-0.5)*100;
//         solution[i] = val;
//         obj.set(pos.x, pos.y, pos.z, val);
//     }
//     for (let x = 0; x < dim.x; x += 1){
//         for (let y = 0; y < dim.y; y += 1){
//             for (let z = 0; z < dim.z; z += 1){
//                 compValue({ x: x, y: y, z: z }, dim, obj, solution, type);
//             }
//         }
//     }
// }

// function setterGetterTestsValues(obj, dim, solution, type, numElements){
//     let numRandomTests = 10000;
//     while (numRandomTests-- > 0) {
//         const i = Math.floor(Math.random() * dim.x * dim.y * dim.z);
//         const pos = utils.index1Dto3D(i, dim);
//         compValues(pos, dim, obj, solution, type, numElements);
//         if (Math.random() < 0.1) {
//             // set null
//             obj.setValues(pos.x, pos.y, pos.z, null);
//             for (let j = 0; j < numElements; j += 1) {
//                 solution[numElements*i + j] = utils.nullValForType(type);
//             }
//         } else {
//             const values = [];
//             for (let j = 0; j < numElements; j += 1) {
//                 const val = (Math.random()-0.5)*100;
//                 solution[numElements*i + j] = val;
//                 values.push(val);
//             }
//             obj.setValues(pos.x, pos.y, pos.z, values);
//         }
//     }
//     for (let x = 0; x < dim.x; x += 1){
//         for (let y = 0; y < dim.y; y += 1){
//             for (let z = 0; z < dim.z; z += 1){
//                 compValues({x:x, y:y, z:z}, dim, obj, solution, type, numElements);
//             }
//         }
//     }
// }

// function setterGetterTestsVec3(obj, dim, solution, type){
//     let numRandomTests = 10000;
//     while (numRandomTests-- > 0) {
//         const i = Math.floor(Math.random() * dim.x * dim.y * dim.z);
//         const pos = utils.index1Dto3D(i, dim);
//         compVec3(pos, dim, obj, solution, type);
//         if (Math.random() < 0.1) {
//             // set null
//             obj.setVector3(pos.x, pos.y, pos.z, null);
//             solution[3*i] = utils.nullValForType(type);
//             solution[3*i+1] = utils.nullValForType(type);
//             solution[3*i+2] = utils.nullValForType(type);
//         } else {
//             const valX = (Math.random()-0.5)*100;
//             const valY = (Math.random()-0.5)*100;
//             const valZ = (Math.random()-0.5)*100;
//             solution[3*i] = valX;
//             solution[3*i+1] = valY;
//             solution[3*i+2] = valZ;
//             obj.setVector3(pos.x, pos.y, pos.z, { x: valX, y: valY, z: valZ });
//         }
//     }
//     for (let x = 0; x < dim.x; x += 1){
//         for (let y = 0; y < dim.y; y += 1){
//             for (let z = 0; z < dim.z; z += 1){
//                 compVec3({x:x, y:y, z:z}, dim, obj, solution, type);
//             }
//         }
//     }
// }

// describe('BufferedVolumetricDataRW', function() {
//     it('init', () => {
//         //check that file is inited with all nulls
//         const zWindow = 3;
//         const dim = {x:24, y:46, z:21};
//         const data = new BufferedVolumetricDataRW(dim, zWindow, 'float32', 'spec/data/RWtest.vol', true, 1);
//         for (let x = 0; x < dim.x; x += 1){
//             for (let y = 0; y < dim.y; y += 1){
//                 for (let z = 0; z < dim.z; z += 1){
//                     expect(data.get(x, y, z)).toEqual(null);
//                 }
//             }
//         }
//         // data buffer is all null
//         for (let i = 0; i < data._data.length; i += 1){
//             expect(data._data[i]).toEqual(utils.nullValForType('float32'));
//         }
//         data.destroy();

//         // 5 elements per vox
//         const numElements = 5;
//         const dataValues = new BufferedVolumetricDataRW(dim, zWindow, 'float32', 'spec/data/RWtest.vol', true, numElements);
//         for (let x = 0; x < dim.x; x += 1){
//             for (let y = 0; y < dim.y; y += 1){
//                 for (let z = 0; z < dim.z; z += 1){
//                     expect(dataValues.getValues(x, y, z)).toEqual(null);
//                 }
//             }
//         }
//         // data buffer is all null
//         for (let i = 0; i < dataValues._data.length; i += 1){
//             expect(dataValues._data[i]).toEqual(utils.nullValForType('float32'));
//         }
//         dataValues.destroy();

//         // vec 3
//         const dataVec3 = new BufferedVolumetricDataRW(dim, zWindow, 'float32', 'spec/data/RWtest.vol', true, 3);
//         for (let x = 0; x < dim.x; x += 1){
//             for (let y = 0; y < dim.y; y += 1){
//                 for (let z = 0; z < dim.z; z += 1){
//                     expect(dataVec3.getVector3(x, y, z)).toEqual(null);
//                 }
//             }
//         }
//         // data buffer is all null
//         for (let i = 0; i < dataVec3._data.length; i += 1){
//             expect(dataVec3._data[i]).toEqual(utils.nullValForType('float32'));
//         }
//         dataVec3.destroy();
//     });

//     it('get/set', () => {
//         const zWindow = 3;
//         const dim = {x:20, y:22, z:17};

//         // float32
//         const dataFloat = new BufferedVolumetricDataRW(dim, zWindow, 'float32', 'spec/data/RWtest.vol', true, 1);
//         const solutionFloat32 = new Float32Array(dim.x * dim.y * dim.z);
//         for (let i = 0; i < dim.x * dim.y * dim.z; i += 1) {
//             solutionFloat32[i] = utils.nullValForType('float32');
//         }
//         setterGetterTests(dataFloat, dim, solutionFloat32, 'float32');
//         dataFloat.destroy();

//         // int32
//         const dataInt = new BufferedVolumetricDataRW(dim, zWindow, 'int32', 'spec/data/RWtest.vol', true, 1);
//         const solutionInt32 = new Int32Array(dim.x * dim.y * dim.z);
//         for (let i = 0; i < dim.x * dim.y * dim.z; i += 1) {
//             solutionInt32[i] = utils.nullValForType('int32');
//         }
//         setterGetterTests(dataInt, dim, solutionInt32, 'int32');

//         expect( () => { dataInt.setVector3(2, 5, 12, { x:3, y:35, z:-2.3 }) } ).toThrow(new Error('Must be exactly three elements per voxel to call setVector3().'));
//         expect( () => { dataInt.setValues(2, 5, 12, [2]) } ).toThrow(new Error('Must be more than 1 element per voxel to call setValues().'));

//         dataInt.destroy();
//     });

//     it('get/setValues', () => {
//         const zWindow = 3;
//         const dim = {x:24, y:23, z:51};
//         const numElements = 4;
//         // float32
//         const data = new BufferedVolumetricDataRW(dim, zWindow, 'float32', 'spec/data/RWtest.vol', true, numElements);
//         const solutionFloat32 = new Float32Array(dim.x * dim.y * dim.z * numElements);
//         for (let i = 0; i < solutionFloat32.length; i += 1) {
//             solutionFloat32[i] = utils.nullValForType('float32');
//         }
//         setterGetterTestsValues(data, dim, solutionFloat32, 'float32', numElements);

//         expect( () => { data.set(2, 5, 12, 2) } ).toThrow(new Error('Must be exactly 1 element per voxel to call set().'));
//         expect( () => { data.setValues(2, 5, 12, [2, 3]) } ).toThrow(new Error('setValues() val param must be same length as numElementsPerVox.'));
//         data.destroy();
//     });

//     it('get/setVector3', () => {
//         const zWindow = 7;
//         const dim = {x:24, y:23, z:51};
//         // float32
//         const dataVec3 = new BufferedVolumetricDataRW(dim, zWindow, 'float32', 'spec/data/RWtest.vol', true, 3);
//         const solutionFloat32 = new Float32Array(dim.x * dim.y * dim.z * 3);
//         for (let i = 0; i < solutionFloat32.length; i += 1) {
//             solutionFloat32[i] = utils.nullValForType('float32');
//         }
//         setterGetterTestsVec3(dataVec3, dim, solutionFloat32, 'float32');

//         expect( () => { dataVec3.set(2, 5, 12, 2) } ).toThrow(new Error('Must be exactly 1 element per voxel to call set().'));
//         expect( () => { dataVec3.setValues(2, 5, 12, [2, 3]) } ).toThrow(new Error('setValues() val param must be same length as numElementsPerVox.'));
//         dataVec3.destroy();
//     });
// });