// AWS services database for the quiz
export const awsServices = [
  "AWS Lambda",
  "Amazon EFS",
  "Amazon S3",
  "AWS Marketplace",
  "Elastic Load Balancing",
  "Amazon EC2",
  "AWS Fargate",
  "Amazon ECS",
  "Amazon EKS",
  "Amazon SNS",
  "Amazon SQS",
  "Amazon EventBridge",
  "Amazon Route 53",
  "Amazon RDS",
  "Amazon Aurora",
  "Amazon API Gateway",
  "Amazon DynamoDB",
  "Amazon Kinesis Data Streams",
  "Amazon Data Firehose",
  "Amazon CloudWatch",
  "AWS IAM Identity Center",
  "Amazon Athena",
  "AWS Step Functions",
  "Amazon CloudFront",
  "Amazon VPC",
  "AWS CloudTrail",
  "Amazon ElastiCache",
  "Amazon Redshift",
  "Amazon CodeCatalyst",
  "Amazon OpenSearch Service",
  "AWS CloudFormation",
  "AWS CDK",
];

// AWS service descriptions for the quiz
export const awsServiceDescriptions = {
  "AWS Lambda": "This serverless compute service runs your code without you managing any servers. It executes only when needed and automatically scales from a few requests to thousands per second. Unlike container services, you only upload your code and it handles everything else.",
  "Amazon EFS": "This file storage service automatically grows and shrinks as you add or remove files. Unlike object storage, it provides shared file access for multiple compute instances simultaneously, making it perfect for applications that need a common file system.",
  "Amazon S3": "This object storage service stores virtually unlimited amounts of data as objects in buckets. Unlike file storage, it's accessed via API calls and excels at storing unstructured data like images, videos, and backups with 99.999999999% durability.",
  "AWS Marketplace": "This digital catalog lets you find and buy third-party software that runs on AWS. Unlike building software yourself, you can quickly deploy pre-configured solutions with flexible pricing options and simplified billing through your AWS account.",
  "Elastic Load Balancing": "This service distributes incoming traffic across multiple targets to ensure no single instance gets overwhelmed. It automatically scales as traffic changes and continuously checks target health, routing requests only to healthy instances.",
  "Amazon EC2": "This service provides resizable virtual servers in the cloud. Unlike serverless options, you have complete control over your computing resources, operating systems, and networking, making it ideal for applications that need specific configurations or consistent performance.",
  "AWS Fargate": "This serverless compute engine runs containers without you managing servers. Unlike traditional container services, you don't worry about cluster provisioning or capacity planning - just package your application in containers and Fargate handles the infrastructure.",
  "Amazon ECS": "This container management service helps you run Docker containers at scale. Unlike Kubernetes, it's deeply integrated with AWS services and offers a simpler way to deploy containerized applications with less operational complexity.",
  "Amazon EKS": "This managed Kubernetes service eliminates the need to install and operate your own Kubernetes control plane. Unlike other container services, it's fully compatible with standard Kubernetes tools and provides certified Kubernetes conformance for workload portability.",
  "Amazon SNS": "This messaging service lets publishers send messages to multiple subscribers simultaneously. Unlike queue services, it follows a publish-subscribe model where a single message can be delivered to many endpoints including functions, HTTP endpoints, email, and mobile devices.",
  "Amazon SQS": "This message queuing service stores messages until they're processed by a consumer. Unlike topic-based messaging, each message is delivered to exactly one receiver, making it perfect for distributing work among multiple processors and ensuring tasks complete reliably.",
  "Amazon EventBridge": "This event bus service connects applications by routing events between them based on rules you define. It uniquely handles events from your own code, AWS services, and third-party applications, making it the central hub for event-driven architectures.",
  "Amazon Route 53": "This DNS service translates human-readable domain names into IP addresses. Unlike basic DNS providers, it offers advanced routing policies based on latency, geography, and health checks to direct users to the optimal endpoint for lowest latency and highest availability.",
  "Amazon RDS": "This database service manages relational databases for you, handling time-consuming tasks like backups, patching, and scaling. Unlike managing your own databases, it automates administration while giving you full access to the underlying database engine of your choice.",
  "Amazon Aurora": "This cloud-native relational database delivers the performance of commercial databases at one-tenth the cost. Unlike standard MySQL or PostgreSQL, it provides five times the throughput while maintaining compatibility with these engines, making migration seamless.",
  "Amazon API Gateway": "This service creates, publishes and manages APIs at any scale. Unlike building your own API infrastructure, it handles authentication, throttling, monitoring and version management while connecting your APIs to various backend services.",
  "Amazon DynamoDB": "This NoSQL database delivers consistent single-digit millisecond performance at any scale. Unlike traditional databases, it automatically scales throughput capacity with zero downtime and requires no server management, perfect for applications with unpredictable workloads.",
  "Amazon Kinesis Data Streams": "This streaming data service lets you continuously collect and process large data streams in real time. Unlike batch processing, it handles data as it's generated, allowing immediate analysis of clickstreams, IoT device data, and application logs.",
  "Amazon Data Firehose": "This service loads streaming data into data stores and analytics tools without you writing code. Unlike other streaming services, it automatically converts data formats, scales to match throughput, and minimizes storage costs through compression and batching.",
  "Amazon CloudWatch": "This monitoring service provides visibility into your cloud resources and applications. Unlike traditional monitoring tools, it collects metrics, logs, and events across your AWS infrastructure, giving you unified insights and automated actions based on thresholds you define.",
  "AWS IAM Identity Center": "This service provides single sign-on access across your AWS accounts and applications. Unlike managing separate credentials for each system, it creates a central place to assign user permissions across your entire AWS organization with one login experience.",
  "Amazon Athena": "This query service analyzes data directly in S3 using standard SQL without moving the data. Unlike traditional data warehouses, it requires no infrastructure setup, has no data loading step, and you pay only for the queries you run.",
  "AWS Step Functions": "This orchestration service coordinates the components of distributed applications using visual workflows. Unlike writing complex coordination code yourself, it manages state, checkpoints, and restarts for you, making it easy to build and update multi-step processes.",
  "Amazon CloudFront": "This content delivery network speeds up distribution of your content globally. Unlike serving from a single location, it caches your content at edge locations worldwide, reducing latency for users and protecting against DDoS attacks.",
  "Amazon VPC": "This networking service lets you create an isolated section of the AWS cloud. Unlike using the public cloud directly, you define your own private network topology with complete control over IP addressing, subnets, routing tables, and network gateways.",
  "AWS CloudTrail": "This service tracks user activity and API usage across your AWS account. Unlike basic logging, it creates a complete history of actions taken through the console, SDKs, and command line tools, helping with security analysis, resource change tracking, and compliance auditing.",
  "Amazon ElastiCache": "This in-memory caching service improves application performance by retrieving data from high-speed memory stores. Unlike relying solely on disk-based databases, it dramatically reduces data access latency for read-heavy workloads and real-time applications.",
  "Amazon Redshift": "This data warehouse service analyzes petabytes of data using SQL queries. Unlike traditional databases, it's optimized for high-performance analysis of massive datasets through columnar storage, parallel processing, and compression algorithms.",
  "Amazon CodeCatalyst": "This development service unifies the tools needed for software projects in one place. Unlike piecing together separate development tools, it provides everything teams need for planning, coding, building, testing, and deploying applications in a single collaborative space.",
  "Amazon OpenSearch Service": "This search and analytics service makes it easy to perform interactive data exploration. Unlike basic search functions, it enables real-time application monitoring, log analytics, and full-text search with visualization capabilities across large volumes of data.",
  "AWS CloudFormation": "This infrastructure as code service creates and manages AWS resources through templates. Unlike manual configuration, it treats infrastructure as code, allowing you to model your entire cloud environment in text files that can be versioned, reused, and shared.",
  "AWS CDK": "This infrastructure as code framework lets you define cloud resources using familiar programming languages. Unlike template-based approaches, you can use TypeScript, Python, Java or .NET to create reusable components with the full power of a programming language."
};

// Audio processing constants
export const TARGET_SAMPLE_RATE = 16000;
export const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");

// Create a string of all AWS services for the system prompt
export const awsServicesString = [...awsServices]
  .sort(() => Math.random() - 0.5)
  .join(", ");

// Number of services to include in the system prompt
export const NUM_SERVICES_IN_PROMPT = 10;

// Get random services for the system prompt
export const getRandomServices = (count) => {
  const shuffled = [...awsServices].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

// Create system prompt with service descriptions
export const createSystemPrompt = () => {
  const selectedServices = getRandomServices(NUM_SERVICES_IN_PROMPT);
  
  return `You are the host of an AWS BuilderCards Quiz Game. Follow these rules:

1. When the user says "Let's start", "Start the quiz", "Begin", or similar phrases, start the quiz game by introducing yourself briefly and then giving the first question.

2. For each question, select an AWS service from the list of all available services. Use the pre-written descriptions from the awsServiceDescriptions object. It's CRITICAL that you select services randomly and NOT in order.

3. When the user says "I found it", "found it", "this is it", "here it is", "got it", or similar phrases indicating they have found the card, ALWAYS use the analyzeImageTool to take a photo and analyze the card they are showing. This is critical for the game to function properly.

4. After the card is analyzed, immediately tell the user if they're correct or incorrect based on the analysis result. Be very strict in your judgment - the card must show EXACTLY the AWS service you described, not a similar or related service.

5. If the user asks for "next question", "another one", or similar phrases, provide a new randomly selected AWS service description. Never repeat the same pattern of services - ensure true randomness in your selection.

6. Keep track of which services you've already described to avoid immediate repetition, but eventually all services should have a chance to be selected.

7. Keep your responses conversational but concise (2-3 sentences).

8. If the user asks to end the game, thank them for playing.

Here are some example service descriptions you can use:
${selectedServices.map(service => `- ${service}: ${awsServiceDescriptions[service]}`).join('\n')}

Remember, this is a voice-based interaction, so make your responses clear and engaging.`;
};

// Custom system prompt - you can modify this
export const SYSTEM_PROMPT = createSystemPrompt();
