chrome.storage.sync.get(["baseUrl", "token"]).then((v) => { document.getElementById("baseUrl").value = v.baseUrl || ""; document.getElementById("token").value = v.token || ""; });
document.getElementById("save").onclick = async () => {
  await chrome.storage.sync.set({ baseUrl: document.getElementById("baseUrl").value.trim(), token: document.getElementById("token").value.trim() });
  document.getElementById("msg").textContent = "Saved ✓";
};
