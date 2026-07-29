import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class IoTPushApi implements ICredentialType {
	name = 'ioTPushApi';

	displayName = 'IoTPush API';

	documentationUrl = 'https://www.iotpush.com/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'API key for private topics. Found in your iotpush dashboard under the topic settings.',
		},
		{
			displayName: 'Topic',
			name: 'topic',
			type: 'string',
			default: '',
			placeholder: 'my-topic',
			description:
				'The topic this API key belongs to. Only used to verify the credential; nodes take their topic from the node parameter.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://www.iotpush.com',
			url: '=/api/push/{{$credentials.topic}}',
			method: 'GET',
			qs: {
				limit: 1,
			},
		},
	};
}
