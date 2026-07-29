import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

const BASE_URL = 'https://www.iotpush.com';

/**
 * IoTPush Trigger
 *
 * Starts an n8n workflow when something happens on an iotpush topic:
 * a user taps an action button, a message is delivered, read, or expires.
 *
 * This closes the "n8n can only send, never receive" gap.
 *
 * Registration lifecycle uses iotpush's existing outbound webhook API:
 *   POST   /api/webhooks                    -> create   { url, events, topic_ids }
 *   GET    /api/webhooks                    -> list (used by checkExists)
 *   DELETE /api/webhooks/{webhook_id}       -> delete
 *
 * REQUIRES the server-side auth patch (see server-patch/webhooks-apikey-auth.md).
 * Today /api/webhooks only accepts a cookie session, so a topic API key gets 401.
 */
export class IoTPushTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IoTPush Trigger',
		name: 'ioTPushTrigger',
		icon: 'file:iotpush.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["topic"]}}',
		description: 'Starts the workflow on iotpush events (action tapped, delivered, read, expired)',
		defaults: {
			name: 'IoTPush Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'ioTPushApi',
				required: true,
			},
		],
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
				displayName: 'Topic',
				name: 'topic',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'my-topic',
				description: 'The iotpush topic to listen on. Must match the topic your API key belongs to.',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['action'],
				description: 'Which iotpush events should start this workflow',
				options: [
					{
						name: 'Action Tapped',
						value: 'action',
						description: 'A user tapped an action button or sent a reply on a notification',
					},
					{
						name: 'Delivered',
						value: 'delivered',
						description: 'A notification reached the device',
					},
					{
						name: 'Read',
						value: 'read',
						description: 'A user opened the notification',
					},
					{
						name: 'Expired',
						value: 'expired',
						description: 'A notification expired before being acted on',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Only These Action IDs',
						name: 'actionIds',
						type: 'string',
						default: '',
						placeholder: 'approve,reject',
						description:
							'Comma-separated action IDs. When set, only these actions start the workflow, everything else is acknowledged and dropped.',
					},
					{
						displayName: 'Raw Body',
						name: 'rawBody',
						type: 'boolean',
						default: false,
						description: 'Whether to output the untouched webhook payload instead of the normalised shape',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const webhookUrl = this.getNodeWebhookUrl('default');

				if (webhookData.webhookId !== undefined) {
					return true;
				}

				// No stored ID: look for an orphan registration pointing at this URL
				// (happens when a workflow is duplicated or static data is cleared).
				try {
					const existing = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'ioTPushApi',
						{
							method: 'GET',
							url: `${BASE_URL}/api/webhooks`,
							json: true,
						},
					)) as IDataObject[];

					for (const hook of existing ?? []) {
						if (hook.url === webhookUrl) {
							webhookData.webhookId = hook.id;
							return true;
						}
					}
				} catch {
					// Listing is best-effort. Fall through to create.
					return false;
				}

				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const topic = this.getNodeParameter('topic') as string;
				const events = this.getNodeParameter('events') as string[];
				const webhookData = this.getWorkflowStaticData('node');

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'ioTPushApi',
					{
						method: 'POST',
						url: `${BASE_URL}/api/webhooks`,
						body: {
							url: webhookUrl,
							events,
							topic_ids: [topic],
						},
						json: true,
					},
				)) as IDataObject;

				if (response?.id === undefined) {
					return false;
				}

				webhookData.webhookId = response.id;
				webhookData.topic = topic;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');

				if (webhookData.webhookId === undefined) {
					return true;
				}

				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'ioTPushApi', {
						method: 'DELETE',
						url: `${BASE_URL}/api/webhooks/${webhookData.webhookId}`,
						json: true,
					});
				} catch {
					// Already gone server-side, or the account was rotated. Clear locally either way.
					delete webhookData.webhookId;
					delete webhookData.topic;
					return false;
				}

				delete webhookData.webhookId;
				delete webhookData.topic;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;
		const options = this.getNodeParameter('options', {}) as {
			actionIds?: string;
			rawBody?: boolean;
		};

		// Action filter: acknowledge but do not start the workflow.
		if (options.actionIds) {
			const allowed = options.actionIds
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean);

			const incoming = (body.action_id ?? (body.action as IDataObject)?.id) as string | undefined;

			if (allowed.length > 0 && (incoming === undefined || !allowed.includes(incoming))) {
				return { webhookResponse: { received: true, ignored: true } };
			}
		}

		if (options.rawBody) {
			return { workflowData: [this.helpers.returnJsonArray([body])] };
		}

		const normalised: IDataObject = {
			event: body.event ?? body.type ?? 'unknown',
			messageId: body.message_id ?? (body.message as IDataObject)?.id,
			topic: body.topic ?? (body.topic_id as string),
			actionId: body.action_id ?? (body.action as IDataObject)?.id,
			actionLabel: (body.action as IDataObject)?.label,
			replyText: body.reply_text,
			deviceId: body.device_id,
			deviceName: body.device_name,
			timestamp: body.created_at ?? body.timestamp ?? new Date().toISOString(),
			raw: body,
		};

		return {
			workflowData: [this.helpers.returnJsonArray([normalised])],
		};
	}
}
