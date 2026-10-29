// Commissioner trade review. Approving executes the trade with league-core.js.
const pendingList = document.querySelector("#admin-pending-trades");
const negotiatingList = document.querySelector("#admin-negotiating-trades");
const historyList = document.querySelector("#admin-trade-history");
const adminStorageNotice = document.querySelector("#admin-storage-notice");
const adminStatus = document.querySelector("#admin-status");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  adminStorageNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}

function emptyNote(text) {
  const note = document.createElement("p");
  note.className = "empty-state";
  note.textContent = text;
  return note;
}

function renderAdminTrades() {
  const trades = officeData.pendingTrades;
  const pending = tradesAwaitingAdmin(officeData).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const negotiating = trades.filter((trade) => trade.status === "awaiting-teams")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const history = trades.filter((trade) => !["awaiting-teams", "awaiting-admin"].includes(trade.status))
    .sort((a, b) => (b.resolvedAt || b.createdAt).localeCompare(a.resolvedAt || a.createdAt)).slice(0, 25);

  pendingList.replaceChildren(...pending.map((trade) => {
    const card = buildTradeCard(officeData, trade, { showImpact: true });
    if (canSave) {
      card.querySelector(".trade-offer-actions").append(
        tradeActionButton("Approve trade", "approve", true),
        tradeActionButton("Reject", "reject")
      );
    }
    return card;
  }));
  if (!pending.length) pendingList.append(emptyNote("No trades are waiting for approval."));

  negotiatingList.replaceChildren(...negotiating.map((trade) => buildTradeCard(officeData, trade)));
  if (!negotiating.length) negotiatingList.append(emptyNote("No trades are being negotiated."));

  historyList.replaceChildren(...history.map((trade) => buildTradeCard(officeData, trade)));
  if (!history.length) historyList.append(emptyNote("No trade decisions yet."));
  refreshNavNotifications();
}

function decideTrade(tradeId, action) {
  // Re-read storage so a decision never overwrites changes made in another tab.
  try {
    officeData = readStoredOffice() || officeData;
  } catch {
    adminStatus.textContent = "Saved data could not be read. No changes were made.";
    return;
  }
  const trade = officeData.pendingTrades.find(({ id }) => id === tradeId);
  if (!trade || trade.status !== "awaiting-admin") {
    adminStatus.textContent = "That trade is no longer awaiting approval.";
    renderAdminTrades();
    return;
  }
  const now = new Date().toISOString();
  const names = trade.participants.map(teamName).join(", ");
  if (action === "approve") {
    const year = currentLeagueYear();
    const check = validateTradeAssets(officeData, trade.lines, trade.participants, year);
    if (check.error) {
      adminStatus.textContent = `${check.error} The trade cannot be approved as proposed; reject it instead.`;
      return;
    }
    const pickMoves = check.assets.filter((asset) => asset.kind === "pick")
      .map((asset) => `${asset.pick.year} Round ${pickRoundLabel(asset.pick)} (${asset.pick.originalTeam}) → ${asset.destinationId}`);
    const sides = tradeSides(check.assets, trade.participants);
    const players = check.assets.filter((asset) => asset.kind === "player").map((asset) => asset.player.name);
    applyTradeAssets(officeData, check.assets, year);
    logTransaction(officeData, { type: "trade", teams: [...trade.participants], player: players.join(", "), sides, auto: true, tradeId: trade.id });
    trade.pickMoves = pickMoves.length ? pickMoves : undefined;
    Object.assign(trade, { status: "approved", resolvedAt: now, note: `Approved by the commissioner for the ${year} league year.` });
  } else {
    Object.assign(trade, { status: "rejected", resolvedAt: now, note: "Rejected by the commissioner." });
  }
  try {
    writeStoredOffice(officeData);
  } catch (error) {
    adminStatus.textContent = `Could not save: ${error.message}. Reload the page before trying again.`;
    return;
  }
  adminStatus.textContent = action === "approve"
    ? `Trade approved among ${names}. Players and dead cap were updated${trade.pickMoves ? `, and these picks now belong to their new teams in the Draft Pick Manager: ${trade.pickMoves.join("; ")}` : ""}.`
    : `Trade among ${names} rejected.`;
  renderAdminTrades();
}

// Two-step confirm: the first click arms the button, the second executes.
pendingList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-trade-action]");
  const card = button?.closest("[data-trade-id]");
  if (!card) return;
  if (!button.classList.contains("is-armed")) {
    pendingList.querySelectorAll(".is-armed").forEach((armed) => {
      armed.classList.remove("is-armed");
      armed.textContent = armed.dataset.tradeAction === "approve" ? "Approve trade" : "Reject";
    });
    button.classList.add("is-armed");
    button.textContent = button.dataset.tradeAction === "approve" ? "Click again to approve" : "Click again to reject";
    return;
  }
  decideTrade(card.dataset.tradeId, button.dataset.tradeAction);
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    renderAdminTrades();
  } catch {
    adminStatus.textContent = "An update from another tab could not be read.";
  }
});

renderAdminTrades();
