window.__ModuleLoader__.load({ id: "dsh-turn-delete", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);
let __deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
__deepseek_ai_dsh_client_ui_primitives = __toESM(__deepseek_ai_dsh_client_ui_primitives);

//#region src/shared.ts
const TURN_DELETE_PATH = "/dsh-turn-delete";
const TOMBSTONE_PROVIDER = "dsh-turn-delete";
const TOMBSTONE_MODEL = "tombstone";

//#endregion
//#region src/client/DeletedTurnMarker.tsx
let ownerSequence = 0;
function turnRows(marker) {
	const tailRow = marker.closest("[data-turn-tail]")?.closest("[data-chat-flow-kind=\"turn-tail\"]");
	if (tailRow === void 0 || tailRow === null) return [];
	const rows = [tailRow];
	let cursor = tailRow.previousElementSibling;
	while (cursor instanceof HTMLElement) {
		if (cursor.querySelector("[data-turn-tail]") !== null) break;
		rows.push(cursor);
		cursor = cursor.previousElementSibling;
	}
	return rows;
}
function concealDeletedTurn(marker, turn) {
	const owner = `${String(turn)}-${String(++ownerSequence)}`;
	const changed = [];
	for (const element of turnRows(marker)) {
		changed.push({
			element,
			hidden: element.hidden
		});
		element.dataset.dshTurnDeleteOwner = owner;
		element.hidden = true;
	}
	return () => {
		for (const entry of changed) {
			if (entry.element.dataset.dshTurnDeleteOwner !== owner) continue;
			delete entry.element.dataset.dshTurnDeleteOwner;
			entry.element.hidden = entry.hidden;
		}
	};
}
function DeletedTurnMarker({ matched }) {
	const markerRef = (0, react.useRef)(null);
	(0, react.useLayoutEffect)(() => {
		const marker = markerRef.current;
		if (marker === null) return;
		const list = marker.closest("[data-chat-flow-kind=\"turn-tail\"]")?.parentElement;
		if (list === void 0 || list === null) return;
		let restore = concealDeletedTurn(marker, matched.turn);
		const observer = new MutationObserver(() => {
			restore();
			restore = concealDeletedTurn(marker, matched.turn);
		});
		observer.observe(list, {
			childList: true,
			subtree: true
		});
		return () => {
			observer.disconnect();
			restore();
		};
	}, [matched.turn]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		ref: markerRef,
		"data-dsh-deleted-turn": matched.turn,
		hidden: true
	});
}

//#endregion
//#region src/client/locales.ts
const zh = {
	"action.delete": "删除这一轮对话",
	"action.busy": "任务运行时不能删除对话",
	"dialog.title": "删除这一轮对话？",
	"dialog.description": "这会从当前 Session 和后续模型上下文中移除本轮的提问、回答与工具记录，但不会删除整个 Session。",
	"dialog.cancel": "取消",
	"dialog.confirm": "删除这一轮",
	"dialog.deleting": "正在删除…",
	"error.busy": "任务正在运行，请结束后再删除。",
	"error.compacted": "这一轮已经被压缩进上下文摘要，无法单独删除。",
	"error.unavailable": "这一轮已变化或不存在，无法删除。",
	"error.generic": "删除失败，请重试。"
};
const en = {
	"action.delete": "Delete this turn",
	"action.busy": "Turns cannot be deleted while the task is running",
	"dialog.title": "Delete this turn?",
	"dialog.description": "This removes the prompt, response, and tool records from this Session and future model context. It does not delete the Session.",
	"dialog.cancel": "Cancel",
	"dialog.confirm": "Delete turn",
	"dialog.deleting": "Deleting…",
	"error.busy": "Wait for the task to finish before deleting this turn.",
	"error.compacted": "This turn has already been folded into a context summary and cannot be deleted independently.",
	"error.unavailable": "This turn changed or no longer exists and cannot be deleted.",
	"error.generic": "Could not delete this turn. Try again."
};

//#endregion
//#region src/client/TurnDeleteAction.tsx
const actionStyle = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	width: 28,
	height: 28,
	padding: 6,
	border: "none",
	borderRadius: 28,
	background: "transparent",
	color: "var(--dsw-alias-label-tertiary)",
	cursor: "pointer"
};
const confirmStyle = { color: "var(--dsw-alias-state-error-primary)" };
const errorStyle = {
	color: "var(--dsw-alias-state-error-primary)",
	fontSize: 13,
	lineHeight: 1.5
};
function TurnDeleteAction({ messageId, deleteTurn, useSession, t }) {
	const running = useSession((snapshot) => snapshot.running);
	const subagent = useSession((snapshot) => snapshot.subagent);
	const [open, setOpen] = (0, react.useState)(false);
	const [pending, setPending] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)(null);
	const alive = (0, react.useRef)(true);
	(0, react.useEffect)(() => {
		alive.current = true;
		return () => {
			alive.current = false;
		};
	}, []);
	if (subagent !== null) return null;
	const unavailable = running || pending;
	const close = () => {
		if (pending) return;
		setOpen(false);
		setError(null);
	};
	const confirm = () => {
		if (unavailable) return;
		setPending(true);
		setError(null);
		deleteTurn(messageId).then((result) => {
			if (!alive.current) return;
			setPending(false);
			if (result.ok) {
				setOpen(false);
				return;
			}
			if (result.error.code === "AGENT_BUSY") setError(t("error.busy"));
			else if (result.error.code === "TURN_COMPACTED") setError(t("error.compacted"));
			else if (result.error.code === "TARGET_NOT_FOUND" || result.error.code === "TURN_NOT_CLOSED") setError(t("error.unavailable"));
			else setError(t("error.generic"));
		}).catch(() => {
			if (!alive.current) return;
			setPending(false);
			setError(t("error.generic"));
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Tooltip, {
		label: running ? t("action.busy") : t("action.delete"),
		side: "bottom",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			style: {
				...actionStyle,
				opacity: running ? .4 : 1,
				cursor: running ? "default" : "pointer"
			},
			"aria-label": t("action.delete"),
			"aria-disabled": running || void 0,
			onClick: running ? void 0 : () => {
				setOpen(true);
				setError(null);
			},
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
		})
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Modal, {
		open,
		onClose: close,
		closeLabel: t("dialog.cancel"),
		title: t("dialog.title"),
		description: t("dialog.description"),
		footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "outline",
			disabled: pending,
			onClick: close,
			children: t("dialog.cancel")
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "outline",
			style: confirmStyle,
			disabled: pending || running,
			onClick: confirm,
			children: pending ? t("dialog.deleting") : t("dialog.confirm")
		})] }),
		children: error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			style: errorStyle,
			role: "alert",
			children: error
		})
	})] });
}

//#endregion
//#region src/client/turn-deletion.ts
function deletedTurn(event) {
	return event.type === "assistant/message" && typeof event.surfaceOp === "object" && event.data.message.content.length === 0 && event.data.message.source.provider === TOMBSTONE_PROVIDER && event.data.message.source.model === TOMBSTONE_MODEL ? event.data.turn : void 0;
}
const turnDeletionDefinition = {
	kind: "turn-delete",
	match: (event) => {
		const turn = deletedTurn(event);
		return turn === void 0 ? null : {
			id: String(turn),
			role: "start"
		};
	},
	start: (_context, match) => {
		const turn = deletedTurn(match.event);
		if (turn === void 0) throw new Error("turn-delete start requires a deletion tombstone");
		return { turn };
	},
	update: (context) => context.state,
	publication: () => "immediate",
	buildLocationData: (context, scope) => {
		if (scope !== "turn" || context.state === void 0) return null;
		return {
			kind: "turn",
			turn: context.state.turn,
			key: "turn-delete",
			value: {
				hidden: true,
				turn: context.state.turn
			}
		};
	}
};
function selectDeletedTurn(owner) {
	const data = owner.turn.data.get("turn-delete");
	return data?.hidden === true ? data : null;
}

//#endregion
//#region src/client/index.tsx
const NS = "turn-delete";
const inject = [
	"slots",
	"locale",
	"uiConversation"
];
async function postDelete(sessionId, assistantMessageId) {
	const response = await fetch(TURN_DELETE_PATH, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			sessionId,
			assistantMessageId
		})
	});
	const value = await response.json();
	if (typeof value !== "object" || value === null || typeof value.ok !== "boolean") throw new Error(`turn deletion returned HTTP ${String(response.status)}`);
	return value;
}
function apply(ctx) {
	ctx.uiConversation.events.register(turnDeletionDefinition);
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "turn-delete: dictionaries");
	ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
		name: "conversation.chat.assistant-actions",
		id: "turn-delete",
		order: 90,
		locale: NS,
		inject: (sessionId) => ({ deleteTurn: (assistantMessageId) => postDelete(sessionId, assistantMessageId) })
	}, TurnDeleteAction));
	ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
		name: "conversation.chat.turnTail",
		select: selectDeletedTurn
	}, DeletedTurnMarker));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
//# sourceMappingURL=client.js.map