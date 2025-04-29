// AWS service descriptions for the quiz
export const awsServiceDescriptions = {
  "AWS Lambda":
    "This serverless compute service runs your code without you managing any servers. It executes only when needed and automatically scales from a few requests to thousands per second. Unlike container services, you only upload your code and it handles everything else.",
  "Amazon EFS":
    "This file storage service automatically grows and shrinks as you add or remove files. Unlike object storage, it provides shared file access for multiple compute instances simultaneously, making it perfect for applications that need a common file system.",
  "Amazon S3":
    "This object storage service stores virtually unlimited amounts of data as objects in buckets. Unlike file storage, it's accessed via API calls and excels at storing unstructured data like images, videos, and backups with 99.999999999% durability.",
  "AWS Marketplace":
    "This digital catalog lets you find and buy third-party software that runs on AWS. Unlike building software yourself, you can quickly deploy pre-configured solutions with flexible pricing options and simplified billing through your AWS account.",
  "Elastic Load Balancing":
    "This service distributes incoming traffic across multiple targets to ensure no single instance gets overwhelmed. It automatically scales as traffic changes and continuously checks target health, routing requests only to healthy instances.",
  "Amazon EC2":
    "This service provides resizable virtual servers in the cloud. Unlike serverless options, you have complete control over your computing resources, operating systems, and networking, making it ideal for applications that need specific configurations or consistent performance.",
  "AWS Fargate":
    "This serverless compute engine runs containers without you managing servers. Unlike EC2-based container hosting, you don't worry about cluster provisioning or capacity planning - just package your application in containers and this service handles the infrastructure.",
  "Amazon ECS":
    "This container management service uses AWS's own container orchestration technology designed specifically for deep integration with other AWS services. Unlike Kubernetes-based solutions, it offers a simpler AWS-native approach to deploying containerized applications with less operational complexity.",
  "Amazon EKS":
    "This managed Kubernetes service runs the standard, unmodified Kubernetes software that's fully compatible with all Kubernetes tools and plugins. Unlike AWS-specific container services, it prioritizes open-source compatibility and workload portability across any Kubernetes environment, whether on-premises or in other clouds.",
  "Amazon SNS":
    "This messaging service lets publishers send messages to multiple subscribers simultaneously. Unlike queue services, it follows a publish-subscribe model where a single message can be delivered to many endpoints including functions, HTTP endpoints, email, and mobile devices.",
  "Amazon SQS":
    "This message queuing service stores messages until they're processed by a consumer. Unlike topic-based messaging, each message is delivered to exactly one receiver, making it perfect for distributing work among multiple processors and ensuring tasks complete reliably.",
  "Amazon EventBridge":
    "This event bus service connects applications by routing events between them based on rules you define. Unlike simple messaging services, it uniquely handles events from your own code, AWS services, and third-party applications, making it the central hub for event-driven architectures.",
  "Amazon Route 53":
    "This DNS service translates human-readable domain names into IP addresses. Unlike basic DNS providers, it offers advanced routing policies based on latency, geography, and health checks to direct users to the optimal endpoint for lowest latency and highest availability.",
  "Amazon RDS":
    "This managed database service supports multiple database engines including MySQL, PostgreSQL, Oracle, SQL Server, and MariaDB. Unlike self-managed databases, it automates administration tasks like backups, patching, and scaling while giving you full access to the standard database engine of your choice.",
  "Amazon Aurora":
    "This specialized cloud-native database engine is built specifically for the cloud with a distributed storage architecture. Unlike standard managed database offerings, it provides up to five times the throughput of standard MySQL and three times that of PostgreSQL while maintaining compatibility with these engines, making it ideal for high-performance workloads.",
  "Amazon API Gateway":
    "This service creates, publishes and manages APIs at any scale. Unlike building your own API infrastructure, it handles authentication, throttling, monitoring and version management while connecting your APIs to various backend services.",
  "Amazon DynamoDB":
    "This NoSQL database delivers consistent single-digit millisecond performance at any scale. Unlike traditional databases, it automatically scales throughput capacity with zero downtime and requires no server management, perfect for applications with unpredictable workloads.",
  "Amazon Kinesis Data Streams":
    "This streaming data service provides direct, low-latency access to your raw streaming data with custom processing. Unlike managed delivery services, it gives you complete control over data consumers, allowing you to build custom applications that process records in real-time with sub-second access to the data.",
  "Amazon Data Firehose":
    "This fully managed service automatically delivers streaming data to destinations like S3, Redshift, and Elasticsearch without any coding required. Unlike stream processing services, it focuses specifically on reliable data delivery with format conversion and transformation capabilities, not on custom processing logic.",
  "Amazon CloudWatch":
    "This foundational monitoring service is natively integrated with virtually every AWS service. Unlike specialized monitoring tools, it combines metrics collection, log aggregation, and alarm capabilities in a single service that can trigger automated actions across your entire AWS infrastructure.",
  "AWS IAM Identity Center":
    "This service provides single sign-on access across your AWS accounts and applications. Unlike managing separate credentials for each system, it creates a central place to assign user permissions across your entire AWS organization with one login experience.",
  "Amazon Athena":
    "This query service analyzes data directly in S3 using standard SQL without moving the data. Unlike traditional data warehouses, it requires no infrastructure setup, has no data loading step, and you pay only for the queries you run.",
  "AWS Step Functions":
    "This orchestration service coordinates the components of distributed applications using visual workflows. Unlike writing complex coordination code yourself, it manages state, checkpoints, and restarts for you, making it easy to build and update multi-step processes.",
  "Amazon CloudFront":
    "This content delivery network speeds up distribution of your content globally. Unlike serving from a single location, it caches your content at edge locations worldwide, reducing latency for users and protecting against DDoS attacks.",
  "Amazon VPC":
    "This networking service lets you create an isolated section of the AWS cloud. Unlike using the public cloud directly, you define your own private network topology with complete control over IP addressing, subnets, routing tables, and network gateways.",
  "AWS CloudTrail":
    "This service tracks user activity and API usage across your AWS account. Unlike basic logging, it creates a complete history of actions taken through the console, SDKs, and command line tools, helping with security analysis, resource change tracking, and compliance auditing.",
  "Amazon ElastiCache":
    "This in-memory caching service specifically supports Redis and Memcached engines for improving application performance. Unlike other memory solutions, it's designed as a dedicated caching layer that sits between your application and database, dramatically reducing data access latency for read-heavy workloads.",
  "Amazon Redshift":
    "This data warehouse service analyzes petabytes of data using SQL queries. Unlike traditional databases, it's optimized for high-performance analysis of massive datasets through columnar storage, parallel processing, and compression algorithms.",
  "Amazon CodeCatalyst":
    "This development service unifies the tools needed for software projects in one place. Unlike piecing together separate development tools, it provides everything teams need for planning, coding, building, testing, and deploying applications in a single collaborative space.",
  "Amazon OpenSearch Service":
    "This search and analytics service makes it easy to perform interactive data exploration. Unlike basic search functions, it enables real-time application monitoring, log analytics, and full-text search with visualization capabilities across large volumes of data.",
  "AWS CloudFormation":
    "This infrastructure as code service uses declarative JSON or YAML templates to provision resources. Unlike programmatic approaches, it focuses on describing the desired state of your infrastructure through template files that can be versioned, reused, and shared.",
  "AWS CDK":
    "This infrastructure as code framework lets you define cloud resources using imperative programming in TypeScript, Python, Java or .NET. Unlike template-based approaches, it leverages the full power of programming languages for creating reusable components with logic, loops, and conditions.",
};

// AWS services are derived from the keys of awsServiceDescriptions
export const awsServices = Object.keys(awsServiceDescriptions);

// Audio processing constants
export const TARGET_SAMPLE_RATE = 16000;
export const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");

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

2. For each question, select an AWS service from the list of all available services. IMPORTANT: You MUST use the EXACT pre-written descriptions without any modifications or paraphrasing. Read the description word-for-word as it appears. It's CRITICAL that you select services randomly and NOT in order.

3. When the user says "I found it", "found it", "this is it", "here it is", "got it", or similar phrases indicating they have found the card, ALWAYS use the analyzeImageTool to take a photo and analyze the card they are showing. This is critical for the game to function properly.

4. After the card is analyzed, immediately tell the user if they're correct or incorrect based on the analysis result. Be very strict in your judgment - the card must show EXACTLY the AWS service you described, not a similar or related service.

5. If the user asks for "next question", "another one", or similar phrases, provide a new randomly selected AWS service description. Never repeat the same pattern of services - ensure true randomness in your selection.

6. Keep track of which services you've already described to avoid immediate repetition, but eventually all services should have a chance to be selected.

7. Keep your responses conversational but concise (2-3 sentences), EXCEPT for the service descriptions which must be read exactly as written.

8. If the user asks to end the game, thank them for playing.

Here are some example service descriptions you can use:
${selectedServices.map((service) => `- ${service}: ${awsServiceDescriptions[service]}`).join("\n")}

Remember, this is a voice-based interaction, so make your responses clear and engaging, but NEVER modify the service descriptions - they must be read exactly as written.`;
};

// Custom system prompt - you can modify this
export const SYSTEM_PROMPT = createSystemPrompt();
