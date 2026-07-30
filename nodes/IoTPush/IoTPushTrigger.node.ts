import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

/**
 * IoTPush Trigger
 *
 * Starts a workflow when someone acts on an iotpush notification: taps an
 * action button, or sends a text reply.
 *
 * HOW IT WORKS
 * ------------
 * iotpush delivers action results to the `callback_url` carried on the message
 * itself (see POST /api/action). So this node is a passive listener:
 *
 *   1. Copy this node's Production Webhook URL from the panel above.
 *   2. Paste it into the IoTPush node's "Callback URL" field on Send Push.
 *   3. Add Action Buttons to that same Send Push node.
 *
 * When the user taps a button, iotpush POSTs here and the workflow runs.
 *
 * There is deliberately no webhook auto-registration. iotpush does expose a
 * /api/webhooks CRUD API, but nothing server-side ever reads that table to
 * dispatch events -- registered webhooks are stored and never fired (only
 * /api/webhooks/{id}/test pings them manually). Registering there would look
 * like it worked and then never trigger. The per-message callback_url path is
 * the one that actually delivers.
 *
 * INCOMING PAYLOAD (from /api/action)
 * -----------------------------------
 * {
 *   event: "action", receipt_id, message_id, topic_id,
 *   action: "approve", action_label: "Approve", reply: null,
 *   user_id, device: "iPhone 17 Pro Max", timestamp
 * }
 */
export class IoTPushTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IoTPush Trigger',
		name: 'ioTPushTrigger',
		icon: 'file:iotpush.svg',
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when a user taps an action button or replies to a notification',
		defaults: {
			name: 'IoTPush Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Copy the <b>Production URL</b> above into the <b>Callback URL</b> field of your IoTPush "Send Push" node, then add Action Buttons to that node. Tapping a button triggers this workflow.',
				name: 'setupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Only These Action IDs',
				name: 'actionIds',
				type: 'string',
				default: '',
				placeholder: 'approve,reject',
				description:
					'Comma-separated action IDs. When set, other actions are acknowledged with 200 but do not start the workflow. Leave empty to accept every action.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Shared Secret Header',
						name: 'secretHeader',
						type: 'string',
						default: '',
						placeholder: 'X-Callback-Token',
						description:
							'Name of a header to require on incoming requests. Set the same header via Callback Headers on the Send Push node. Requests without a matching value are rejected with 401.',
					},
					{
						displayName: 'Shared Secret Value',
						name: 'secretValue',
						type: 'string',
						typeOptions: { password: true },
						default: '',
						description: 'Expected value for the shared secret header',
					},
					{
						displayName: 'Ignore Test Pings',
						name: 'ignoreTest',
						type: 'boolean',
						default: false,
						description:
							'Whether to drop payloads with event "test" (sent by /api/webhooks/{id}/test) instead of starting the workflow',
					},
					{
						displayName: 'Raw Body',
						name: 'rawBody',
						type: 'boolean',
						default: false,
						description: 'Whether to output the untouched payload instead of the normalised shape',
					},
				],
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;
		const headers = this.getHeaderData() as IDataObject;

		const actionIds = this.getNodeParameter('actionIds', '') as string;
		const options = this.getNodeParameter('options', {}) as {
			secretHeader?: string;
			secretValue?: string;
			ignoreTest?: boolean;
			rawBody?: boolean;
		};

		// Optional shared-secret check. iotpush does not sign callback_url
		// deliveries, so a header set through callback_headers is the practical
		// way to keep a public n8n webhook from being triggered by anyone.
		if (options.secretHeader) {
			const received = headers[options.secretHeader.toLowerCase()];
			if (received !== options.secretValue) {
				return {
					webhookResponse: {
						status: 401,
						body: { error: 'Invalid or missing shared secret' },
					},
					noWebhookResponse: false,
				};
			}
		}

		const event = (body.event ?? 'unknown') as string;

		if (options.ignoreTest && event === 'test') {
			return { webhookResponse: { received: true, ignored: 'test ping' } };
		}

		// /api/action sends `action` as a plain string id, with the human label
		// in `action_label`. The test endpoint sends action: "test_action".
		const actionId = (body.action ?? body.action_id) as string | undefined;

		if (actionIds.trim()) {
			const allowed = actionIds
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean);

			if (allowed.length > 0 && (actionId === undefined || !allowed.includes(actionId))) {
				return {
					webhookResponse: { received: true, ignored: `action "${actionId}" not in filter` },
				};
			}
		}

		if (options.rawBody) {
			return { workflowData: [this.helpers.returnJsonArray([body])] };
		}

		const normalised: IDataObject = {
			event,
			actionId: actionId ?? null,
			actionLabel: (body.action_label ?? null) as string | null,
			reply: (body.reply ?? body.reply_text ?? null) as string | null,
			messageId: (body.message_id ?? null) as string | null,
			receiptId: (body.receipt_id ?? null) as string | null,
			topicId: (body.topic_id ?? null) as string | null,
			device: (body.device ?? body.device_name ?? null) as string | null,
			userId: (body.user_id ?? null) as string | null,
			timestamp: (body.timestamp ?? new Date().toISOString()) as string,
			isTest: event === 'test',
			raw: body,
		};

		return {
			workflowData: [this.helpers.returnJsonArray([normalised])],
		};
	}
}
