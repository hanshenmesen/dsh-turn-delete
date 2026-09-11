import { MessageId, createAssistantMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { isAppendSurfaceEvent, isReplacementSurfaceEvent } from "@deepseek-ai/dsh-session/surface";

/**
 * 0.1.2-alpha.1 的 runMaintenance 在 agent.phase 不是 idle 时直接抛
 * `agent "<id>" already has active work`，而 UI 侧可能已经认为回合结束。
 * 这里区分「任务真的在跑」与「phase 没回 idle」，后者稍等再重试一次。
 */
async function runMaintenanceIdleAware(agent, job) {
	let insideJob = false;
	const wrapped = (signal) => {
		insideJob = true;
		return job(signal);
	};
	try {
		return await agent.runMaintenance(wrapped);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (insideJob || !/already has active work/i.test(message)) throw error;
		await Promise.race([
			Promise.resolve().then(() => agent.whenIdle?.()).catch(() => {}),
			new Promise((resolve) => setTimeout(resolve, 4e3))
		]);
		try {
			return await agent.runMaintenance(wrapped);
		} catch (retryError) {
			throw retryError;
		}
	}
}

//#region src/shared.ts
const TURN_DELETE_PATH = "/dsh-turn-delete";
const TOMBSTONE_PROVIDER = "dsh-turn-delete";
const TOMBSTONE_MODEL = "tombstone";

//#endregion
//#region src/turn-delete.ts
var TurnDeleteError = class extends Error {
	name = "TurnDeleteError";
	constructor(code, message) {
		super(message);
		this.code = code;
	}
};
function isTurnDeleteEvent(event) {
	return event.type === "assistant/message" && isReplacementSurfaceEvent(event) && event.data.message.content.length === 0 && event.data.message.source.provider === TOMBSTONE_PROVIDER && event.data.message.source.model === TOMBSTONE_MODEL;
}
function eventTurn(event) {
	if (event.type === "assistant/message" || event.type === "tool/result") return event.data.turn;
}
/**
 * 读取 Session 的事件数组。
 * DSH 0.1.2-alpha.1 起 `Session.events` 属性被移除，公开 API 为 `snapshotEvents()`。
 */
function sessionEvents(session) {
	if (session === null || session === void 0) return [];
	if (typeof session.snapshotEvents === "function") return session.snapshotEvents();
	return Array.isArray(session.events) ? session.events : [];
}
function turnBracket(events, turn, targetSeq) {
	const start = events.findLast((event) => event.seq <= targetSeq && event.type === "turn/start" && event.data.turn === turn);
	const end = events.find((event) => event.seq >= targetSeq && event.type === "turn/end" && event.data.turn === turn);
	return start === void 0 || end === void 0 ? void 0 : {
		start: start.seq,
		end: end.seq
	};
}
function originBelongsToTurn(event, turn, bracket) {
	return event.seq > bracket.start && event.seq < bracket.end || eventTurn(event) === turn;
}
function surfaceOrigins(seq, events, memo, visiting = /* @__PURE__ */ new Set()) {
	const cached = memo.get(seq);
	if (cached !== void 0) return cached;
	if (visiting.has(seq)) return /* @__PURE__ */ new Set();
	visiting.add(seq);
	const event = events[seq];
	const origins = /* @__PURE__ */ new Set();
	if (event !== void 0) {
		if (isAppendSurfaceEvent(event)) origins.add(seq);
		const sources = event.sourceEventSeqs ?? [];
		for (const source of sources) for (const origin of surfaceOrigins(source, events, memo, visiting)) origins.add(origin);
	}
	visiting.delete(seq);
	memo.set(seq, origins);
	return origins;
}
async function deleteUnderMaintenance(ctx, agent, assistantMessageId, signal) {
	signal.throwIfAborted();
	const session = agent.session;
	if (ctx.sessions.get(session.id) !== session) throw new TurnDeleteError("TARGET_NOT_FOUND", `session "${session.id}" is no longer live`);
	const events = sessionEvents(session);
	const target = events.find((event) => event.type === "assistant/message" && isAppendSurfaceEvent(event) && event.data.message.id === assistantMessageId);
	if (target === void 0) throw new TurnDeleteError("TARGET_NOT_FOUND", `assistant message "${assistantMessageId}" was not found`);
	const turn = target.data.turn;
	const existing = events.find((event) => isTurnDeleteEvent(event) && event.data.turn === turn);
	if (existing !== void 0) return {
		turn,
		seq: existing.seq
	};
	const bracket = turnBracket(events, turn, target.seq);
	if (bracket === void 0) throw new TurnDeleteError("TURN_NOT_CLOSED", `turn ${String(turn)} is not closed`);
	const originSeqs = new Set(events.filter((event) => isAppendSurfaceEvent(event) && originBelongsToTurn(event, turn, bracket)).map((event) => event.seq));
	const currentNodes = session.surface.nodes;
	if (!currentNodes.includes(target.seq)) throw new TurnDeleteError("TURN_COMPACTED", `turn ${String(turn)} is no longer independently deletable`);
	const memo = /* @__PURE__ */ new Map();
	const selected = [];
	const covered = /* @__PURE__ */ new Set();
	for (const seq of currentNodes) {
		const origins = surfaceOrigins(seq, events, memo);
		const targetOrigins = [...origins].filter((origin) => originSeqs.has(origin));
		if (targetOrigins.length === 0) continue;
		if ([...origins].some((origin) => !originSeqs.has(origin))) throw new TurnDeleteError("TURN_COMPACTED", `turn ${String(turn)} shares a compacted surface node`);
		const current = events[seq];
		if (current !== void 0 && !originSeqs.has(seq) && !(current.type === "tool/result" && current.data.turn === turn)) throw new TurnDeleteError("TURN_COMPACTED", `turn ${String(turn)} contains a non-local replacement`);
		selected.push(seq);
		for (const origin of targetOrigins) covered.add(origin);
	}
	if ([...originSeqs].some((origin) => !covered.has(origin)) || selected.length === 0) throw new TurnDeleteError("TURN_COMPACTED", `turn ${String(turn)} is partially compacted`);
	const positions = selected.map((seq) => currentNodes.indexOf(seq));
	const first = positions[0];
	if (first === void 0 || positions.some((position, index) => position !== first + index)) throw new TurnDeleteError("TURN_COMPACTED", `turn ${String(turn)} is not a contiguous surface span`);
	signal.throwIfAborted();
	const tombstone = session.append("assistant/message", {
		turn,
		step: target.data.step,
		message: createAssistantMessage({
			content: [],
			source: {
				provider: TOMBSTONE_PROVIDER,
				model: TOMBSTONE_MODEL
			}
		})
	}, {
		surfaceOp: {
			op: "replace",
			start: selected[0],
			end: selected.at(-1)
		},
		sourceEventSeqs: selected
	});
	await ctx.sessions.flush(session);
	return {
		turn,
		seq: tombstone.seq
	};
}
/**
 * 会话里是否还有未结束的回合（持久化事件层面）。
 * 用来区分「agent 真的在跑」与「agent.phase 卡在非 idle、但回合其实已经结束」。
 */
function hasOpenTurn(session) {
	const events = sessionEvents(session);
	const open = /* @__PURE__ */ new Set();
	for (const event of events) {
		if (event.type === "turn/start") open.add(event.data.turn);
		else if (event.type === "turn/end") open.delete(event.data.turn);
	}
	return open.size > 0;
}
async function deleteTurn(ctx, agent, assistantMessageId) {
	try {
		return await runMaintenanceIdleAware(agent, (signal) => deleteUnderMaintenance(ctx, agent, assistantMessageId, signal));
	} catch (error) {
		if (error instanceof TurnDeleteError) throw error;
		const message = error instanceof Error ? error.message : String(error);
		// phase 卡死兜底：agent 声称有活跃工作，但事件里已没有未结束的回合 —— 直接删除。
		if (/already has active work/i.test(message) && !hasOpenTurn(agent.session)) {
			ctx.logger?.warn?.(`turn-delete: agent "${agent.id}" phase is ${String(agent?.phase?.kind)} but no turn is open; deleting directly`);
			try {
				return await deleteUnderMaintenance(ctx, agent, assistantMessageId, new AbortController().signal);
			} catch (fallbackError) {
				if (fallbackError instanceof TurnDeleteError) throw fallbackError;
				throw new TurnDeleteError("AGENT_BUSY", fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
			}
		}
		throw new TurnDeleteError("AGENT_BUSY", message);
	}
}

//#endregion
//#region src/http.ts
const MAX_BODY_BYTES = 16 * 1024;
function decodeRequest(value) {
	if (typeof value !== "object" || value === null) throw new TypeError("request body must be an object");
	const record = value;
	if (typeof record.sessionId !== "string" || record.sessionId.length === 0) throw new TypeError("sessionId must be a non-empty string");
	if (typeof record.assistantMessageId !== "string" || record.assistantMessageId.length === 0) throw new TypeError("assistantMessageId must be a non-empty string");
	return {
		sessionId: record.sessionId,
		assistantMessageId: record.assistantMessageId
	};
}
function requestJson(request) {
	return new Promise((resolve, reject) => {
		const decoder = new TextDecoder();
		let text = "";
		let bytes = 0;
		let settled = false;
		request.on("data", (chunk) => {
			if (settled) return;
			bytes += typeof chunk === "string" ? new TextEncoder().encode(chunk).length : chunk.byteLength;
			if (bytes > MAX_BODY_BYTES) {
				settled = true;
				reject(/* @__PURE__ */ new TypeError("request body is too large"));
				return;
			}
			text += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
		});
		request.on("end", () => {
			if (settled) return;
			settled = true;
			try {
				text += decoder.decode();
				resolve(JSON.parse(text));
			} catch (error) {
				reject(error);
			}
		});
		request.on("error", (error) => {
			if (settled) return;
			settled = true;
			reject(error);
		});
	});
}
function respondJson(response, status, value) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(value));
}
async function handleTurnDelete(ctx, request, response) {
	if (request.method !== "POST") {
		response.writeHead(405, { allow: "POST" });
		response.end();
		return;
	}
	const contentType = request.headers?.["content-type"];
	if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith("application/json")) {
		respondJson(response, 415, {
			ok: false,
			error: {
				code: "INVALID_REQUEST",
				message: "application/json required"
			}
		});
		return;
	}
	try {
		const input = decodeRequest(await requestJson(request));
		const sessionId = SessionId(input.sessionId);
		const agent = ctx.agents.get(sessionId);
		if (agent === void 0) throw new TurnDeleteError("TARGET_NOT_FOUND", `session "${input.sessionId}" is not active`);
		respondJson(response, 200, {
			ok: true,
			value: await deleteTurn(ctx, agent, MessageId(input.assistantMessageId))
		});
	} catch (error) {
		if (error instanceof TurnDeleteError) {
			respondJson(response, error.code === "AGENT_BUSY" ? 423 : 409, {
				ok: false,
				error: {
					code: error.code,
					message: error.message
				}
			});
			return;
		}
		respondJson(response, 400, {
			ok: false,
			error: {
				code: "INVALID_REQUEST",
				message: error instanceof Error ? error.message : String(error)
			}
		});
	}
}

//#endregion
//#region src/index.ts
const name = "turn-delete";
const inject = [
	"sessions",
	"agents",
	"webServer"
];
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: TURN_DELETE_PATH,
		handler: (request, response) => handleTurnDelete(ctx, request, response)
	}), "turn-delete: HTTP route");
}

//#endregion
export { TOMBSTONE_MODEL, TOMBSTONE_PROVIDER, TURN_DELETE_PATH, TurnDeleteError, apply, deleteTurn, inject, isTurnDeleteEvent, name };