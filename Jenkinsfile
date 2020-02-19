pipeline {
	agent {
		label 'docker-multiarch'
	}
	options {
		buildDiscarder(logRotator(numToKeepStr: '5'))
		disableConcurrentBuilds()
	}
	environment {
		IMAGE                      = "nginx-proxy-manager"
		BUILD_VERSION              = getVersion()
		MAJOR_VERSION              = "2"
		BRANCH_LOWER               = "${BRANCH_NAME.toLowerCase().replaceAll('/', '-')}"
		COMPOSE_PROJECT_NAME       = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}"
		COMPOSE_FILE               = 'docker/docker-compose.ci.yml'
		COMPOSE_INTERACTIVE_NO_CLI = 1
		BUILDX_NAME                = "${COMPOSE_PROJECT_NAME}"
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
				ansiColor('xterm') {
					sh './scripts/frontend-build'
				}
			}
		}
		stage('Backend') {
			steps {
				ansiColor('xterm') {
					echo 'Checking Syntax ...'
					// See: https://github.com/yarnpkg/yarn/issues/3254
					sh '''docker run --rm \\
						-v "$(pwd)/backend:/app" \\
						-w /app \\
						node:latest \\
						sh -c "yarn install && yarn eslint . && rm -rf node_modules"
					'''

					echo 'Docker Build ...'
					sh '''docker build --pull --no-cache --squash --compress \\
						-t "${IMAGE}:ci-${BUILD_NUMBER}" \\
						-f docker/Dockerfile \\
						--build-arg TARGETPLATFORM=linux/amd64 \\
						--build-arg BUILDPLATFORM=linux/amd64 \\
						--build-arg BUILD_VERSION="${BUILD_VERSION}" \\
						--build-arg BUILD_COMMIT="${BUILD_COMMIT}" \\
						--build-arg BUILD_DATE="$(date '+%Y-%m-%d %T %Z')" \\
						.
					'''
				}
			}
		}
		stage('Test') {
			steps {
				ansiColor('xterm') {
					// Bring up a stack
					sh 'docker-compose up -d fullstack'
					sh './scripts/wait-healthy $(docker-compose ps -q fullstack) 120'

					// Run tests
					sh 'rm -rf test/results'
					sh 'docker-compose up cypress'
					// Get results
					sh 'docker cp -L "$(docker-compose ps -q cypress):/results" test/'
				}
			}
			post {
				always {
					junit 'test/results/junit/*'
					// Cypress videos and screenshot artifacts
					dir(path: 'test/results') {
						archiveArtifacts allowEmptyArchive: true, artifacts: '**/*', excludes: '**/*.xml'
					}
					// Dumps to analyze later
					sh 'mkdir -p debug'
					sh 'docker-compose logs fullstack | gzip > debug/docker_fullstack.log.gz'
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
				ansiColor('xterm') {
					withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
						sh "docker login -u '${duser}' -p '${dpass}'"
						// Buildx with push
						sh "./scripts/buildx --push ${BUILDX_PUSH_TAGS}"
					}
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
				ansiColor('xterm') {
					script {
						def comment = pullRequest.comment("Docker Image for build ${BUILD_NUMBER} is available on [DockerHub](https://cloud.docker.com/repository/docker/jc21/${IMAGE}) as `jc21/${IMAGE}:github-${BRANCH_LOWER}`")
					}
				}
			}
		}
	}
	post {
		always {
			sh 'docker-compose down --rmi all --remove-orphans --volumes -t 30'
			sh 'echo Reverting ownership'
			sh 'docker run --rm -v $(pwd):/data ${DOCKER_CI_TOOLS} chown -R $(id -u):$(id -g) /data'
		}
		success {
			juxtapose event: 'success'
			sh 'figlet "SUCCESS"'
		}
		failure {
			juxtapose event: 'failure'
			sh 'figlet "FAILURE"'
		}
		unstable {
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
