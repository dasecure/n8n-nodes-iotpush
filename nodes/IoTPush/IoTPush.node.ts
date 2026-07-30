import type { INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class IoTPush implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IoTPush',
		name: 'ioTPush',
		icon: 'file:iotpush.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send push notifications via iotpush - multi-channel IoT notifications',
		defaults: {
			name: 'IoTPush',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'ioTPushApi',
				required: false,
			},
		],
		requestDefaults: {
			baseURL: 'https://www.iotpush.com',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			// ------ Resource ------
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Message', value: 'message' }],
				default: 'message',
			},

			// ------ Operations ------
			// NOTE: the former `Topic > Get Info` operation was removed in 1.1.0.
			// It called GET /api/topic/{topic}, a route that has never existed
			// (confirmed 404). There is no endpoint that returns topic metadata to
			// a topic API key: /api/topics is cookie-session only, and
			// /api/topics/{id} exposes DELETE and PATCH but no GET.
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['message'] },
				},
				options: [
					{
						name: 'Send Push',
						value: 'sendPush',
						description: 'Send a push notification to a topic',
						action: 'Send a push notification',
						routing: {
							request: {
								method: 'POST',
								url: '=/api/push/{{$parameter["topic"]}}',
							},
						},
					},
					{
						name: 'Get Messages',
						value: 'getMessages',
						description: 'Get recent messages for a topic',
						action: 'Get recent messages',
						routing: {
							request: {
								method: 'GET',
								url: '=/api/push/{{$parameter["topic"]}}',
								qs: {
									limit: '={{$parameter["limit"]}}',
								},
							},
							output: {
								postReceive: [
									{
										type: 'rootProperty',
										properties: { property: 'messages' },
									},
								],
							},
						},
					},
				],
				default: 'sendPush',
			},

			// ------ Shared ------
			{
				displayName: 'Topic',
				name: 'topic',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'my-topic',
				description: 'The iotpush topic name to send to or query',
			},

			// ------ Send Push ------
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'Hello from n8n!',
				description: 'The notification message body',
				displayOptions: {
					show: { resource: ['message'], operation: ['sendPush'] },
				},
				routing: {
					send: { type: 'body', property: 'message' },
				},
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: { resource: ['message'], operation: ['sendPush'] },
				},
				options: [
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						default: '',
						description: 'Optional title for the notification',
						routing: { send: { type: 'body', property: 'title' } },
					},
					{
						displayName: 'Priority',
						name: 'priority',
						type: 'options',
						options: [
							{ name: 'Low', value: 'low' },
							{ name: 'Normal', value: 'normal' },
							{ name: 'High', value: 'high' },
							{ name: 'Urgent', value: 'urgent' },
						],
						default: 'normal',
						description: 'Priority level of the notification',
						routing: { send: { type: 'body', property: 'priority' } },
					},
					{
						displayName: 'Tags',
						name: 'tags',
						type: 'string',
						default: '',
						placeholder: 'tag1,tag2,tag3',
						description: 'Comma-separated tags for the notification',
						routing: { send: { type: 'body', property: 'tags' } },
					},
					{
						displayName: 'Click URL',
						name: 'clickUrl',
						type: 'string',
						default: '',
						placeholder: 'https://example.com/incident/42',
						description: 'URL to open when the notification is tapped',
						routing: { send: { type: 'body', property: 'click_url' } },
					},
					{
						displayName: 'Callback URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						placeholder: 'https://your-n8n/webhook/...',
						description:
							'Where iotpush posts the result when a user taps an action. Paste the Production URL from an IoTPush Trigger node here to start a workflow on tap.',
						// The API reads this from body key `callback` (NOT `callback_url` --
						// that name is only used in the database and delivery payload).
						// 1.1.1 sent `callback_url`, which the server silently dropped, so
						// taps recorded but never dispatched. Fixed in 1.1.2.
						routing: { send: { type: 'body', property: 'callback' } },
					},
				],
			},

			// ------ Action buttons (human in the loop) ------
			{
				displayName: 'Action Buttons',
				name: 'actionsUi',
				type: 'fixedCollection',
				placeholder: 'Add Action',
				default: {},
				typeOptions: { multipleValues: true },
				description:
					'Buttons shown on the notification. Pair with the IoTPush Trigger node to branch a workflow on what the user taps.',
				displayOptions: {
					show: { resource: ['message'], operation: ['sendPush'] },
				},
				options: [
					{
						displayName: 'Action',
						name: 'action',
						values: [
							{
								displayName: 'ID',
								name: 'id',
								type: 'string',
								default: '',
								placeholder: 'approve',
								description: 'Stable identifier returned by the trigger when tapped',
								required: true,
							},
							{
								displayName: 'Label',
								name: 'label',
								type: 'string',
								default: '',
								placeholder: 'Approve',
								description: 'Text shown on the button',
								required: true,
							},
						],
					},
				],
				routing: {
					send: {
						type: 'body',
						property: 'actions',
						value: '={{ $parameter["actionsUi"].action || [] }}',
					},
				},
			},

			// ------ Callback headers ------
			// iotpush does not sign callback_url deliveries, so a shared-secret
			// header is the practical way to authenticate the callback against a
			// publicly reachable n8n webhook. Pair with Shared Secret Header on
			// the IoTPush Trigger node.
			{
				displayName: 'Callback Headers',
				name: 'callbackHeadersUi',
				type: 'fixedCollection',
				placeholder: 'Add Header',
				default: {},
				typeOptions: { multipleValues: true },
				description:
					'Headers iotpush sends with the callback. Use a shared secret here and verify it on the IoTPush Trigger node.',
				displayOptions: {
					show: { resource: ['message'], operation: ['sendPush'] },
				},
				options: [
					{
						displayName: 'Header',
						name: 'header',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								placeholder: 'X-Callback-Token',
								required: true,
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								typeOptions: { password: true },
								default: '',
								required: true,
							},
						],
					},
				],
				routing: {
					send: {
						type: 'body',
						property: 'callback_headers',
						value:
							'={{ Object.fromEntries((($parameter["callbackHeadersUi"] || {}).header || []).map(h => [h.name, h.value])) }}',
					},
				},
			},

			// ------ Get Messages ------
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 20,
				description: 'Max number of results to return',
				typeOptions: { minValue: 1, maxValue: 100 },
				displayOptions: {
					show: { resource: ['message'], operation: ['getMessages'] },
				},
			},
		],
	};
}
