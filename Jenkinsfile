pipeline {
	agent {
		label 'taurus'
	}
	options {
		buildDiscarder(logRotator(numToKeepStr: '5'))
		disableConcurrentBuilds()
		ansiColor('xterm')
	}
	environment {
		IMAGE                      = 'nginx-proxy-manager'
		BUILD_VERSION              = getVersion()
		BUILD_COMMIT               = getCommit()
		MAJOR_VERSION              = '3'
		BRANCH_LOWER               = "${BRANCH_NAME.toLowerCase().replaceAll('/', '-')}"
		COMPOSE_PROJECT_NAME       = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}"
		COMPOSE_FILE               = 'docker/docker-compose.ci.yml'
		COMPOSE_INTERACTIVE_NO_CLI = 1
		BUILDX_NAME                = "${COMPOSE_PROJECT_NAME}"
		DOCS_BUCKET                = 'jc21-npm-site-next' // TODO: change to prod when official
		DOCS_CDN                   = 'E2Z0128EHS0Q23'     // TODO: same
	}
	stages {
		stage('Environment') {
			parallel {
				stage('Master') {
					when {
						branch 'master'
					}
					steps {
						script {
							env.BUILDX_PUSH_TAGS = "-t docker.io/jc21/${IMAGE}:${BUILD_VERSION} -t docker.io/jc21/${IMAGE}:${MAJOR_VERSION} -t docker.io/jc21/${IMAGE}:latest"
						}
					}
				}
				stage('Other') {
					when {
						not {
							branch 'master'
						}
					}
					steps {
						script {
							// Defaults to the Branch name, which is applies to all branches AND pr's
							env.BUILDX_PUSH_TAGS = "-t docker.io/jc21/${IMAGE}:github-${BRANCH_LOWER}"
						}
					}
				}
			}
		}
		stage('Frontend') {
			steps {
				sh './scripts/ci/build-frontend'
			}
			post {
				always {
					junit 'frontend/eslint.xml'
					junit 'frontend/junit.xml'
				}
			}
		}
		stage('Backend') {
			steps {
				withCredentials([string(credentialsId: 'npm-sentry-dsn', variable: 'SENTRY_DSN')]) {
					withCredentials([usernamePassword(credentialsId: 'oss-index-token', passwordVariable: 'NANCY_TOKEN', usernameVariable: 'NANCY_USER')]) {
						sh './scripts/ci/test-backend'
					}
					sh './scripts/ci/build-backend'
					sh '''docker build --pull --no-cache \\
						-t "${IMAGE}:${BRANCH_LOWER}-ci-${BUILD_NUMBER}" \\
						-f docker/Dockerfile \\
						--build-arg BUILD_COMMIT="${BUILD_COMMIT}" \\
						--build-arg BUILD_DATE="$(date '+%Y-%m-%d %T %Z')" \\
						--build-arg BUILD_VERSION="${BUILD_VERSION}" \\
						.
					'''
				}
			}
			post {
				success {
					archiveArtifacts allowEmptyArchive: false, artifacts: 'bin/*'
				}
			}
		}
		stage('Test') {
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				// Docker image check
				sh '''docker run --rm \
					-v /var/run/docker.sock:/var/run/docker.sock \
					-v "$(pwd)/docker:/app" \
					-e CI=true \
					wagoodman/dive:latest --ci-config /app/.dive-ci \
					"${IMAGE}:${BRANCH_LOWER}-ci-${BUILD_NUMBER}"
				'''
				// Bring up a stack
				sh 'docker-compose up -d fullstack'
				sh './scripts/wait-healthy $(docker-compose ps -q fullstack) 120'
				// Run tests
				sh 'rm -rf test/results'
				sh 'docker-compose up cypress'
				// Get results
				sh 'docker cp -L "$(docker-compose ps -q cypress):/test/results" test/'
			}
			post {
				always {
					// Dumps to analyze later
					sh 'mkdir -p debug'
					sh 'docker-compose logs fullstack | gzip > debug/docker_fullstack.log.gz'
					junit 'test/results/junit/*'
				}
			}
		}
		stage('Docs') {
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				dir(path: 'docs') {
					sh 'yarn install'
					sh 'yarn build'
				}

				// API Docs:
				sh 'docker-compose exec -T fullstack curl -s --output /temp-docs/api-schema.json "http://fullstack:81/api/schema"'
				sh 'mkdir -p "docs/.vuepress/dist/api"'
				sh 'mv docs/api-schema.json docs/.vuepress/dist/api/'

				dir(path: 'docs/.vuepress/dist') {
					sh 'tar -czf ../../docs.tgz *'
				}
			}
		}
		stage('MultiArch Build') {
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				withCredentials([string(credentialsId: 'npm-sentry-dsn', variable: 'SENTRY_DSN')]) {
					withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
						// Docker Login
						sh 'docker login -u "${duser}" -p "${dpass}"'
						// Buildx with push from cache
						sh './scripts/buildx --push ${BUILDX_PUSH_TAGS}'
						// sh './scripts/buildx -o type=local,dest=docker-build'
					}
				}
			}
		}
		stage('Docs Deploy') {
			when {
				allOf {
					branch 'master'
					not {
						equals expected: 'UNSTABLE', actual: currentBuild.result
					}
				}
			}
			steps {
				withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', accessKeyVariable: 'AWS_ACCESS_KEY_ID', credentialsId: 'npm-s3-docs', secretKeyVariable: 'AWS_SECRET_ACCESS_KEY']]) {
					sh """docker run --rm \\
						--name \${COMPOSE_PROJECT_NAME}-docs-upload \\
						-e S3_BUCKET=$DOCS_BUCKET \\
						-e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \\
						-e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \\
						-v \$(pwd):/app \\
						-w /app \\
						jc21/ci-tools \\
						scripts/docs-upload /app/docs/.vuepress/dist/
					"""

					sh """docker run --rm \\
						--name \${COMPOSE_PROJECT_NAME}-docs-invalidate \\
						-e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \\
						-e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \\
						jc21/ci-tools \\
						aws cloudfront create-invalidation --distribution-id $DOCS_CDN --paths '/*'
					"""
				}
			}
		}
		stage('PR Comment') {
			when {
				allOf {
					changeRequest()
					not {
						equals expected: 'UNSTABLE', actual: currentBuild.result
					}
				}
			}
			steps {
				script {
					def comment = pullRequest.comment("This is an automated message from CI:\n\nDocker Image for build ${BUILD_NUMBER} is available on [DockerHub](https://cloud.docker.com/repository/docker/jc21/${IMAGE}) as `jc21/${IMAGE}:git-3-${BRANCH_LOWER}`\n\n**Note:** ensure you backup your NPM instance before testing this PR image! Especially if this PR contains database changes.")
				}
			}
		}
	}
	post {
		always {
			sh 'docker-compose down --rmi all --remove-orphans --volumes -t 30'
			sh './scripts/ci/build-cleanup'
			echo 'Reverting ownership'
			sh 'docker run --rm -v $(pwd):/data jc21/gotools:latest chown -R "$(id -u):$(id -g)" /data'
		}
		success {
			juxtapose event: 'success'
			sh 'figlet "SUCCESS"'
		}
		failure {
			dir(path: 'test') {
				archiveArtifacts allowEmptyArchive: true, artifacts: 'results/**/*', excludes: '**/*.xml'
			}
			archiveArtifacts(artifacts: 'debug/**.*', allowEmptyArchive: true)
			juxtapose event: 'failure'
			sh 'figlet "FAILURE"'
		}
		unstable {
			dir(path: 'test') {
				archiveArtifacts allowEmptyArchive: true, artifacts: 'results/**/*', excludes: '**/*.xml'
			}
			archiveArtifacts(artifacts: 'debug/**.*', allowEmptyArchive: true)
			juxtapose event: 'unstable'
			sh 'figlet "UNSTABLE"'
		}
	}
}

def getVersion() {
	ver = sh(script: 'cat .version', returnStdout: true)
	return ver.trim()
}

def getCommit() {
	ver = sh(script: 'git log -n 1 --format=%h', returnStdout: true)
	return ver.trim()
}
