try {
  await import("http://localhost:3000/src/components/CustomOrderView.tsx");
  console.log("SUCCESS");
} catch (e) {
  console.error("ERROR", e);
}
