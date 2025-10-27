import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { InferenceClient } from '@huggingface/inference'

export default function createServer({ config }) {
    // Create server instance
    const server = new McpServer({
        name: 'greeting-server',
        version: '1.0.0',
        capabilities: {
            tools: {},
            resources: {},
            prompts: {}
        }
    })

    // Register greeting tool
    server.tool(
        'greeting',
        'Greets a user in their preferred language with a personalized message',
        {
            name: z.string().describe('User name to greet'),
            language: z
                .enum([
                    'korean',
                    'english',
                    'japanese',
                    'spanish',
                    'french',
                    'chinese'
                ])
                .describe('Language for the greeting')
        },
        async ({ name, language }) => {
            const greetings: Record<string, string> = {
                korean: `안녕하세요, ${name}님! 반갑습니다!`,
                english: `Hello, ${name}! Nice to meet you!`,
                japanese: `こんにちは、${name}さん！お会いできて嬉しいです！`,
                spanish: `¡Hola, ${name}! ¡Encantado de conocerte!`,
                french: `Bonjour, ${name}! Ravi de vous rencontrer!`,
                chinese: `你好，${name}！很高兴见到你！`
            }

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: greetings[language]
                    }
                ]
            }
        }
    )

    // Register calculator tool
    server.tool(
        'calculator',
        'Performs basic arithmetic operations (addition, subtraction, multiplication, division) on two numbers',
        {
            num1: z.number().describe('First number'),
            num2: z.number().describe('Second number'),
            operator: z
                .enum(['+', '-', '*', '/'])
                .describe('Operator for calculation (+, -, *, /)')
        },
        async ({ num1, num2, operator }) => {
            let result: number
            let operationText: string

            switch (operator) {
                case '+':
                    result = num1 + num2
                    operationText = '더하기'
                    break
                case '-':
                    result = num1 - num2
                    operationText = '빼기'
                    break
                case '*':
                    result = num1 * num2
                    operationText = '곱하기'
                    break
                case '/':
                    if (num2 === 0) {
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: '오류: 0으로 나눌 수 없습니다.'
                                }
                            ],
                            isError: true
                        }
                    }
                    result = num1 / num2
                    operationText = '나누기'
                    break
            }

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `${num1} ${operator} ${num2} = ${result}\n(${num1} ${operationText} ${num2}는 ${result}입니다)`
                    }
                ]
            }
        }
    )

    // Register time tool
    server.tool(
        'time',
        'Returns the current time in the specified timezone (defaults to Asia/Seoul if not provided)',
        {
            timezone: z
                .string()
                .optional()
                .describe(
                    'IANA timezone identifier (e.g., Asia/Seoul, America/New_York, Europe/London). Defaults to Asia/Seoul'
                )
        },
        async ({ timezone }) => {
            const tz = timezone || 'Asia/Seoul'

            try {
                const now = new Date()
                const formatter = new Intl.DateTimeFormat('ko-KR', {
                    timeZone: tz,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })

                const formattedTime = formatter.format(now)
                const tzName = tz === 'Asia/Seoul' ? '한국' : tz

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `현재 ${tzName} 시간: ${formattedTime}`
                        }
                    ]
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `오류: 유효하지 않은 timezone입니다. (${tz})\n올바른 IANA timezone 식별자를 사용해주세요. (예: Asia/Seoul, America/New_York, Europe/London)`
                        }
                    ],
                    isError: true
                }
            }
        }
    )

    // Register image generation tool
    server.tool(
        'generate_image',
        'Generates an image from a text prompt using AI image generation (FLUX.1-schnell model)',
        {
            prompt: z
                .string()
                .describe('Text description of the image to generate')
        },
        async ({ prompt }) => {
            try {
                // Check if HF_TOKEN is available
                if (!process.env.HF_TOKEN) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: '오류: HF_TOKEN 환경 변수가 설정되지 않았습니다.\nHugging Face API 토큰을 설정해주세요.'
                            }
                        ],
                        isError: true
                    }
                }

                const client = new InferenceClient(process.env.HF_TOKEN)

                // Generate image
                const image = await client.textToImage({
                    provider: 'fal-ai',
                    model: 'black-forest-labs/FLUX.1-schnell',
                    inputs: prompt,
                    parameters: { num_inference_steps: 5 }
                })

                // Convert Blob to base64
                const arrayBuffer = await (image as any).arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                const base64Data = buffer.toString('base64')

                return {
                    content: [
                        {
                            type: 'image' as const,
                            data: base64Data,
                            mimeType: 'image/png'
                        }
                    ],
                    _meta: {
                        annotations: {
                            audience: ['user'],
                            priority: 0.9
                        }
                    }
                }
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : '알 수 없는 오류'
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `이미지 생성 중 오류가 발생했습니다: ${errorMessage}`
                        }
                    ],
                    isError: true
                }
            }
        }
    )

    // Register code review prompt
    server.prompt(
        'code_review',
        'Generates a detailed code review prompt for the provided code',
        {
            code: z.string().describe('Code to review'),
            language: z
                .string()
                .optional()
                .describe('Programming language of the code (optional)')
        },
        async ({ code, language }) => {
            const languageInfo = language ? `(${language})` : ''
            const prompt = `다음 코드를 상세하게 리뷰해주세요 ${languageInfo}:

\`\`\`${language || ''}
${code}
\`\`\`

다음 관점에서 코드 리뷰를 진행해주세요:

1. **코드 품질**
   - 가독성: 코드가 읽기 쉽고 이해하기 쉬운가?
   - 명명 규칙: 변수, 함수, 클래스명이 명확하고 일관적인가?
   - 코드 구조: 적절히 모듈화되고 구조화되어 있는가?

2. **성능**
   - 비효율적인 알고리즘이나 로직이 있는가?
   - 메모리 사용이 최적화되어 있는가?
   - 불필요한 연산이나 반복이 있는가?

3. **보안**
   - 보안 취약점이 있는가?
   - 입력 검증이 적절히 이루어지고 있는가?
   - 민감한 정보가 노출되지 않는가?

4. **에러 처리**
   - 예외 상황을 적절히 처리하고 있는가?
   - 에러 메시지가 명확한가?
   - 경계 조건을 고려하고 있는가?

5. **모범 사례**
   - 해당 언어/프레임워크의 모범 사례를 따르고 있는가?
   - 코딩 컨벤션을 준수하고 있는가?
   - 불필요한 중복 코드가 있는가?

6. **개선 제안**
   - 구체적인 개선 방안을 제시해주세요
   - 리팩토링이 필요한 부분을 지적해주세요
   - 더 나은 대안이 있다면 제시해주세요

각 항목에 대해 구체적인 예시와 함께 상세하게 설명해주세요.`

            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: prompt
                        }
                    }
                ]
            }
        }
    )

    // Register server info resource
    server.resource(
        'server-info',
        'mcp://server/info',
        {
            name: 'MCP 서버 정보',
            description: '현재 MCP 서버의 정보를 반환합니다',
            mimeType: 'application/json'
        },
        async () => {
            const serverInfo = {
                name: 'greeting-server',
                version: '1.0.0',
                description:
                    'MCP 서버 - 인사말, 계산기, 시간 조회, 이미지 생성 기능 제공',
                capabilities: {
                    tools: ['greeting', 'calculator', 'time', 'generate_image'],
                    resources: ['server-info'],
                    prompts: ['code_review']
                },
                tools: {
                    greeting: {
                        description: '다국어 인사말 생성',
                        supportedLanguages: [
                            'korean',
                            'english',
                            'japanese',
                            'spanish',
                            'french',
                            'chinese'
                        ]
                    },
                    calculator: {
                        description: '기본 산술 연산',
                        supportedOperations: ['+', '-', '*', '/']
                    },
                    time: {
                        description: '지정된 타임존의 현재 시간 조회',
                        defaultTimezone: 'Asia/Seoul'
                    },
                    generate_image: {
                        description: 'AI 이미지 생성 (FLUX.1-schnell 모델)',
                        model: 'black-forest-labs/FLUX.1-schnell',
                        requiresToken: 'HF_TOKEN'
                    }
                },
                prompts: {
                    code_review: {
                        description: '코드 리뷰를 위한 상세한 프롬프트 생성',
                        parameters: ['code', 'language (optional)']
                    }
                },
                author: 'MCP Developer',
                lastUpdated: new Date().toISOString()
            }

            return {
                contents: [
                    {
                        uri: 'mcp://server/info',
                        mimeType: 'application/json',
                        text: JSON.stringify(serverInfo, null, 2)
                    }
                ]
            }
        }
    )

    // 서버 시작
    async function main() {
        const transport = new StdioServerTransport()
        await server.connect(transport)
        console.error('TypeScript MCP 서버가 시작되었습니다!')
    }

    main().catch(error => {
        console.error('서버 시작 중 오류 발생:', error)
        process.exit(1)
    })

    return server.server
}
