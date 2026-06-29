import { FabricService } from "./src/services/fabricService.js";

async function runTest() {
  try {
    const fakeFabric = {
      code: "TEST1234",
      name: "Test Fabric",
      description: "Test description",
      composition: "100% Wool",
      origin: "Italy",
      image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...",
      priceMultiplier: 1.0,
      stockStatus: "In Stock",
      color: "Multi",
      colorHex: "#2e3a1e",
      stock: 30,
      width: "45 inches",
      price: 35
    };
    console.log("Starting test save...");
    const res = await FabricService.saveFabric(fakeFabric);
    console.log("Test save success:", res);
  } catch (err) {
    console.error("Test save failed:", err);
  }
}

runTest();
