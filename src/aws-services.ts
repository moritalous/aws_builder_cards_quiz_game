// Database storing AWS service information
export interface AWSService {
  name: string;
  description: string;
}

// AWS services database
export const awsServices: AWSService[] = [
  {
    name: "AWS Lambda",
    description:
      "A serverless compute service that lets you run code without provisioning or managing servers. Lambda executes your code only when needed and scales automatically, from a few requests per day to thousands per second.",
  },
  {
    name: "Amazon EFS",
    description:
      "A scalable, fully managed elastic NFS file system for use with AWS Cloud services and on-premises resources. It's built to scale on demand to petabytes without disrupting applications.",
  },
  {
    name: "Amazon S3",
    description:
      "An object storage service offering industry-leading scalability, data availability, security, and performance. It can store and retrieve any amount of data from anywhere on the web.",
  },
  {
    name: "AWS Marketplace",
    description:
      "A digital catalog with thousands of software listings from independent software vendors that make it easy to find, test, buy, and deploy software that runs on AWS.",
  },
  {
    name: "Elastic Load Balancing",
    description:
      "A service that automatically distributes incoming application traffic across multiple targets, such as EC2 instances, containers, and IP addresses, in one or more Availability Zones.",
  },
  {
    name: "Amazon EC2",
    description:
      "A web service that provides secure, resizable compute capacity in the cloud. It's designed to make web-scale cloud computing easier for developers, offering virtual servers in the cloud.",
  },
  {
    name: "AWS Fargate",
    description:
      "A serverless compute engine for containers that works with both Amazon ECS and Amazon EKS. It allows you to run containers without having to manage servers or clusters.",
  },
  {
    name: "Amazon ECS",
    description:
      "A fully managed container orchestration service that makes it easy to run, stop, and manage Docker containers on a cluster of EC2 instances or Fargate.",
  },
  {
    name: "Amazon EKS",
    description:
      "A managed service that makes it easy to run Kubernetes on AWS without needing to install, operate, and maintain your own Kubernetes control plane or nodes.",
  },
  {
    name: "Amazon SNS",
    description:
      "A fully managed messaging service for both application-to-application (A2A) and application-to-person (A2P) communication, enabling decoupled microservices and distributed systems.",
  },
  {
    name: "Amazon SQS",
    description:
      "A fully managed message queuing service that enables you to decouple and scale microservices, distributed systems, and serverless applications, offering both standard and FIFO queues.",
  },
  {
    name: "Amazon EventBridge",
    description:
      "A serverless event bus that makes it easier to build event-driven applications at scale using events generated from your applications, integrated SaaS applications, and AWS services.",
  },
  {
    name: "Amazon Route 53",
    description:
      "A highly available and scalable cloud Domain Name System (DNS) web service designed to give developers and businesses a reliable way to route end users to Internet applications.",
  },
  {
    name: "Amazon RDS",
    description:
      "A managed relational database service that provides cost-efficient and resizable capacity while automating time-consuming administration tasks such as hardware provisioning, database setup, and backups.",
  },
  {
    name: "Amazon Aurora",
    description:
      "A MySQL and PostgreSQL-compatible relational database built for the cloud that combines the performance and availability of traditional enterprise databases with the simplicity and cost-effectiveness of open source databases.",
  },
  {
    name: "Amazon API Gateway",
    description:
      "A fully managed service that makes it easy for developers to create, publish, maintain, monitor, and secure APIs at any scale, acting as a 'front door' for applications to access data or functionality.",
  },
  {
    name: "Amazon DynamoDB",
    description:
      "A key-value and document database that delivers single-digit millisecond performance at any scale, with built-in security, backup and restore, and in-memory caching.",
  },
  {
    name: "Amazon Kinesis Data Streams",
    description:
      "A massively scalable and durable real-time data streaming service that can continuously capture gigabytes of data per second from hundreds of thousands of sources.",
  },
  {
    name: "Amazon Kinesis Data Firehose",
    description:
      "The easiest way to reliably load streaming data into data lakes, data stores, and analytics services, capturing, transforming, and loading streaming data with minimal configuration.",
  },
  {
    name: "Amazon CloudWatch",
    description:
      "A monitoring and observability service that provides data and actionable insights for AWS, hybrid, and on-premises applications and infrastructure resources, collecting metrics, logs, and events.",
  },
  {
    name: "AWS IAM Identity Center",
    description:
      "A cloud service that simplifies managing SSO access to AWS accounts and business applications, providing a central place to manage users and their access to multiple applications and accounts.",
  },
  {
    name: "Amazon Athena",
    description:
      "An interactive query service that makes it easy to analyze data in Amazon S3 using standard SQL, with no need to load data or set up complex ETL processes.",
  },
  {
    name: "AWS Step Functions",
    description:
      "A serverless orchestration service that lets you combine AWS Lambda functions and other AWS services to build business-critical applications, automating workflows without managing infrastructure.",
  },
  {
    name: "Amazon CloudFront",
    description:
      "A fast content delivery network (CDN) service that securely delivers data, videos, applications, and APIs to customers globally with low latency and high transfer speeds.",
  },
  {
    name: "Amazon VPC",
    description:
      "A service that lets you launch AWS resources in a logically isolated virtual network that you define, giving you complete control over your virtual networking environment.",
  },
  {
    name: "AWS CloudTrail",
    description:
      "A service that enables governance, compliance, operational auditing, and risk auditing of your AWS account, tracking user activity and API usage across your AWS infrastructure.",
  },
  {
    name: "Amazon ElastiCache",
    description:
      "A fully managed in-memory caching service supporting Redis and Memcached that helps improve the performance of web applications by retrieving data from fast, managed, in-memory caches.",
  },
  {
    name: "Amazon Redshift",
    description:
      "A fully managed, petabyte-scale data warehouse service in the cloud that makes it simple and cost-effective to analyze all your data using standard SQL and your existing business intelligence tools.",
  },
  {
    name: "Amazon CodeCatalyst",
    description:
      "A unified software development service that makes it faster to build and deliver software on AWS, bringing together tools for coding, building, testing, and deploying applications.",
  },
  {
    name: "Amazon OpenSearch Service",
    description:
      "A managed service that makes it easy to deploy, operate, and scale OpenSearch clusters in the AWS Cloud, offering powerful search, visualization, and analytics capabilities.",
  },
  {
    name: "AWS CloudFormation",
    description:
      "A service that helps you model and set up your AWS resources so you can spend less time managing those resources and more time focusing on your applications that run in AWS.",
  },
  {
    name: "AWS CDK",
    description:
      "A software development framework for defining cloud infrastructure in code and provisioning it through AWS CloudFormation, allowing you to use familiar programming languages to model your applications.",
  },
];

// Function to get a random AWS service
export function getRandomService(): AWSService {
  const randomIndex = Math.floor(Math.random() * awsServices.length);
  return awsServices[randomIndex];
}

// Function to get AWS service information by name
export function getServiceByName(name: string): AWSService | undefined {
  return awsServices.find(
    (service) => service.name.toLowerCase() === name.toLowerCase(),
  );
}
